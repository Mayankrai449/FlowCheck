"""
FlowCheck execution API — proxies arbitrary HTTP requests for a local workflow sandbox.
Do not expose publicly without authentication and URL allowlists.
"""

from __future__ import annotations

import asyncio
import json
import time
from collections import defaultdict
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from safe_runtime import (
    UnsafeExpressionError,
    eval_condition_expression,
    run_user_code,
    validate_user_code,
)
from schemas import (
    CodeFlowNode,
    ConditionFlowNode,
    ExecuteFlowRequest,
    ExecuteFlowResponse,
    ExecuteNodeResult,
    ExecuteWaveRequest,
    HttpFlowNode,
    TriggerFlowNode,
)

app = FastAPI(title="FlowCheck API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _sanitize_headers(headers: dict[str, str]) -> dict[str, str]:
    """
    Browser-exported cURL often includes hop-by-hop and client-specific headers that
    confuse httpx or duplicate what the client sets. Drop those before sending.
    """
    drop_names = {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "proxy-connection",
        "host",
        "content-length",
    }

    out: dict[str, str] = {}
    for k, v in headers.items():
        if k.lower() in drop_names:
            continue
        out[k] = v
    return out


def _graph_has_cycle(ids: set[str], succ: dict[str, list[str]], preds: dict[str, set[str]]) -> bool:
    indeg = {nid: len(preds[nid]) for nid in ids}
    queue = [nid for nid in ids if indeg[nid] == 0]
    processed = 0
    while queue:
        u = queue.pop()
        processed += 1
        for v in succ.get(u, []):
            if v not in ids:
                continue
            indeg[v] -= 1
            if indeg[v] == 0:
                queue.append(v)
    return processed != len(ids)


def _err_detail(exc: BaseException) -> str:
    return f"{type(exc).__name__}: {exc}"[:800]


def _preview(obj: Any, limit: int = 2000) -> str | None:
    if obj is None:
        return None
    if isinstance(obj, str):
        text = obj
    else:
        try:
            text = json.dumps(obj, default=str, ensure_ascii=False)
        except TypeError:
            text = repr(obj)
    return text[:limit] if text else None


async def _run_http(
    client: httpx.AsyncClient,
    node_id: str,
    node: HttpFlowNode,
) -> tuple[ExecuteNodeResult, dict[str, Any]]:
    t0 = time.perf_counter()
    d = node.data
    try:
        m = d.method.upper()
        has_body = bool(d.body is not None and d.body != "")
        safe_headers = _sanitize_headers(dict(d.headers or {}))
        req: dict[str, Any] = {"method": m, "url": d.url, "headers": safe_headers}
        if has_body and m not in ("GET", "HEAD"):
            req["content"] = d.body.encode("utf-8")
        resp = await client.request(**req)
        dt_ms = (time.perf_counter() - t0) * 1000.0
        preview = (resp.text[:2000] if resp.text else "") or None
        payload = {
            "kind": "http",
            "status_code": resp.status_code,
            "response_preview": preview,
        }
        return (
            ExecuteNodeResult(
                node_id=node_id,
                status_code=resp.status_code,
                duration_ms=round(dt_ms, 3),
                response_preview=preview,
                error=None,
            ),
            payload,
        )
    except Exception as e:  # noqa: BLE001 — surface sandbox errors to the UI
        dt_ms = (time.perf_counter() - t0) * 1000.0
        payload = {"kind": "http", "error": str(e)}
        return (
            ExecuteNodeResult(
                node_id=node_id,
                status_code=None,
                duration_ms=round(dt_ms, 3),
                response_preview=None,
                error=str(e),
                error_detail=_err_detail(e),
            ),
            payload,
        )


def _eval_condition_python_block(expression: str, ctx: dict[str, Any]) -> bool:
    validate_user_code(expression)
    safe_builtins: dict[str, Any] = {
        "len": len,
        "str": str,
        "int": int,
        "float": float,
        "bool": bool,
        "min": min,
        "max": max,
        "sum": sum,
        "abs": abs,
        "round": round,
        "sorted": sorted,
        "repr": repr,
        "enumerate": enumerate,
        "zip": zip,
        "range": range,
        "isinstance": isinstance,
        "list": list,
        "dict": dict,
        "tuple": tuple,
        "set": set,
        "frozenset": frozenset,
        "any": any,
        "all": all,
        "print": lambda *a, **k: None,
        "True": True,
        "False": False,
        "None": None,
    }
    g: dict[str, Any] = {"__builtins__": safe_builtins}
    loc: dict[str, Any] = {"ctx": ctx, "result": None}
    exec(compile(expression or "", "<condition_node>", "exec"), g, loc)
    return bool(loc.get("result"))


async def _run_condition(node_id: str, node: ConditionFlowNode, ctx: dict[str, Any]) -> tuple[ExecuteNodeResult, dict[str, Any]]:
    t0 = time.perf_counter()
    try:
        if node.data.eval_mode == "safe_expr":
            ok = eval_condition_expression(node.data.expression, ctx)
        else:
            ok = await asyncio.to_thread(_eval_condition_python_block, node.data.expression, ctx)
        dt_ms = (time.perf_counter() - t0) * 1000.0
        preview = f"condition → {ok}"
        payload = {"kind": "condition", "value": ok}
        return (
            ExecuteNodeResult(
                node_id=node_id,
                status_code=200,
                duration_ms=round(dt_ms, 3),
                response_preview=preview,
                error=None,
            ),
            payload,
        )
    except (UnsafeExpressionError, Exception) as e:
        dt_ms = (time.perf_counter() - t0) * 1000.0
        msg = str(e)
        payload = {"kind": "condition", "error": msg}
        return (
            ExecuteNodeResult(
                node_id=node_id,
                status_code=None,
                duration_ms=round(dt_ms, 3),
                response_preview=None,
                error=msg,
                error_detail=_err_detail(e),
            ),
            payload,
        )


async def _run_code(node_id: str, node: CodeFlowNode, ctx: dict[str, Any]) -> tuple[ExecuteNodeResult, dict[str, Any]]:
    t0 = time.perf_counter()
    timeout = min(30.0, max(0.5, node.data.timeout_s))

    def _sync() -> Any:
        return run_user_code(node.data.code, ctx)

    try:
        result = await asyncio.wait_for(asyncio.to_thread(_sync), timeout=timeout)
        dt_ms = (time.perf_counter() - t0) * 1000.0
        preview = _preview(result)
        payload = {"kind": "code", "result": result}
        return (
            ExecuteNodeResult(
                node_id=node_id,
                status_code=200,
                duration_ms=round(dt_ms, 3),
                response_preview=preview,
                error=None,
            ),
            payload,
        )
    except asyncio.TimeoutError:
        dt_ms = (time.perf_counter() - t0) * 1000.0
        msg = f"Code node exceeded timeout ({timeout}s)"
        payload = {"kind": "code", "error": msg}
        return (
            ExecuteNodeResult(
                node_id=node_id,
                status_code=None,
                duration_ms=round(dt_ms, 3),
                response_preview=None,
                error=msg,
                error_detail=msg,
            ),
            payload,
        )
    except (UnsafeExpressionError, Exception) as e:
        dt_ms = (time.perf_counter() - t0) * 1000.0
        msg = str(e)
        payload = {"kind": "code", "error": msg}
        return (
            ExecuteNodeResult(
                node_id=node_id,
                status_code=None,
                duration_ms=round(dt_ms, 3),
                response_preview=None,
                error=msg,
                error_detail=_err_detail(e),
            ),
            payload,
        )


def _run_trigger(node_id: str, node: TriggerFlowNode) -> tuple[ExecuteNodeResult, dict[str, Any]]:
    t0 = time.perf_counter()
    dt_ms = (time.perf_counter() - t0) * 1000.0
    label = node.data.label or "Trigger"
    note = node.data.note
    preview = label if not note else f"{label}: {note}"
    payload = {"kind": "trigger", "label": label, "note": note}
    return (
        ExecuteNodeResult(
            node_id=node_id,
            status_code=200,
            duration_ms=round(dt_ms, 3),
            response_preview=preview[:2000],
            error=None,
        ),
        payload,
    )


async def _run_one(
    client: httpx.AsyncClient,
    node: Any,
    ctx: dict[str, Any],
) -> tuple[ExecuteNodeResult, dict[str, Any]]:
    nid = node.id
    if isinstance(node, HttpFlowNode):
        return await _run_http(client, nid, node)
    if isinstance(node, ConditionFlowNode):
        return await _run_condition(nid, node, ctx)
    if isinstance(node, CodeFlowNode):
        return await _run_code(nid, node, ctx)
    if isinstance(node, TriggerFlowNode):
        res, payload = _run_trigger(nid, node)
        return res, payload
    raise HTTPException(status_code=400, detail=f"Unknown node type for {nid}")


@app.post("/execute-flow", response_model=ExecuteFlowResponse)
async def execute_flow(payload: ExecuteFlowRequest) -> ExecuteFlowResponse:
    if not payload.nodes:
        raise HTTPException(status_code=400, detail="No nodes provided")

    node_map: dict[str, Any] = {n.id: n for n in payload.nodes}
    ids = set(node_map.keys())
    preds: dict[str, set[str]] = {nid: set() for nid in ids}
    succ: dict[str, list[str]] = defaultdict(list)

    for e in payload.edges:
        if e.source not in ids or e.target not in ids:
            continue
        preds[e.target].add(e.source)
        succ[e.source].append(e.target)

    if _graph_has_cycle(ids, succ, preds):
        raise HTTPException(
            status_code=400,
            detail="Workflow graph contains a cycle; use a DAG only.",
        )

    results: list[ExecuteNodeResult] = []
    completed: set[str] = set()
    context: dict[str, Any] = {}

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(60.0),
        follow_redirects=True,
    ) as client:
        while len(completed) < len(ids):
            ready = [
                nid
                for nid in ids
                if nid not in completed and preds[nid].issubset(completed)
            ]
            if not ready:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot schedule remaining nodes (cycle or invalid graph).",
                )

            async def run_ready(nid: str) -> tuple[ExecuteNodeResult, dict[str, Any]]:
                return await _run_one(client, node_map[nid], context)

            batch_pairs = await asyncio.gather(*[run_ready(nid) for nid in ready])
            for nid, (res, payload) in zip(ready, batch_pairs, strict=True):
                context[nid] = payload
                results.append(res)
            completed.update(ready)

    return ExecuteFlowResponse(results=results)


@app.post("/execute-wave", response_model=ExecuteFlowResponse)
async def execute_wave(payload: ExecuteWaveRequest) -> ExecuteFlowResponse:
    """Run a single wave of mutually independent nodes against a frozen context snapshot."""
    if not payload.nodes:
        raise HTTPException(status_code=400, detail="No nodes provided")

    ctx_snapshot: dict[str, Any] = dict(payload.context)

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(60.0),
        follow_redirects=True,
    ) as client:
        pairs: list[tuple[ExecuteNodeResult, dict[str, Any]]] = await asyncio.gather(
            *[_run_one(client, node, ctx_snapshot) for node in payload.nodes],
        )

    return ExecuteFlowResponse(results=[p[0] for p in pairs])
