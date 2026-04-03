"""
FlowCheck execution API — proxies arbitrary HTTP requests for a local workflow sandbox.
Do not expose publicly without authentication and URL allowlists.
"""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import ExecuteFlowRequest, ExecuteFlowResponse, ExecuteNodeResult

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


async def _run_one(
    client: httpx.AsyncClient,
    node_id: str,
    method: str,
    url: str,
    headers: dict[str, str],
    body: str | None,
) -> ExecuteNodeResult:
    t0 = time.perf_counter()
    try:
        m = method.upper()
        has_body = bool(body is not None and body != "")
        safe_headers = _sanitize_headers(dict(headers or {}))
        req: dict = {"method": m, "url": url, "headers": safe_headers}
        if has_body and m not in ("GET", "HEAD"):
            req["content"] = body.encode("utf-8")
        resp = await client.request(**req)
        dt_ms = (time.perf_counter() - t0) * 1000.0
        preview = (resp.text[:2000] if resp.text else "") or None
        return ExecuteNodeResult(
            node_id=node_id,
            status_code=resp.status_code,
            duration_ms=round(dt_ms, 3),
            response_preview=preview,
            error=None,
        )
    except Exception as e:  # noqa: BLE001 — surface sandbox errors to the UI
        dt_ms = (time.perf_counter() - t0) * 1000.0
        return ExecuteNodeResult(
            node_id=node_id,
            status_code=None,
            duration_ms=round(dt_ms, 3),
            response_preview=None,
            error=str(e),
        )


@app.post("/execute-flow", response_model=ExecuteFlowResponse)
async def execute_flow(payload: ExecuteFlowRequest) -> ExecuteFlowResponse:
    if not payload.nodes:
        raise HTTPException(status_code=400, detail="No nodes provided")

    node_map = {n.id: n for n in payload.nodes}
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
            batch = await asyncio.gather(
                *[
                    _run_one(
                        client,
                        nid,
                        node_map[nid].data.method,
                        node_map[nid].data.url,
                        dict(node_map[nid].data.headers),
                        node_map[nid].data.body,
                    )
                    for nid in ready
                ]
            )
            results.extend(batch)
            completed.update(ready)

    return ExecuteFlowResponse(results=results)
