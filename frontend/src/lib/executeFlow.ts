import type { Edge } from "@xyflow/react"
import { buildExecutionPlan } from "@/lib/executionPlan"
import { resolveTemplate } from "@/lib/resolveTemplate"
import type {
  AnyFlowNodeData,
  AppNode,
  ExecutionOutcome,
  FlowExecutionContext,
} from "@/types/flow"

const base = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000"

export type ExecuteFlowResult = {
  nodeId: string
  statusCode: number | null
  durationMs: number
  responsePreview?: string | null
  error?: string | null
  errorDetail?: string | null
  attempts?: number
  outcome?: ExecutionOutcome
  attemptErrors?: string[]
}

export type ExecuteFlowResponse = {
  results: ExecuteFlowResult[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Within one topological wave, consecutive async nodes run together via
 * Promise.all; each sync node runs alone after prior groups finish.
 */
function splitWaveIntoExecutionGroups(waveNodes: AppNode[]): AppNode[][] {
  const sorted = [...waveNodes].sort((a, b) => a.id.localeCompare(b.id))
  const groups: AppNode[][] = []
  let currentAsync: AppNode[] = []
  for (const n of sorted) {
    const isAsync = n.data.executeAsync !== false
    if (isAsync) {
      currentAsync.push(n)
    } else {
      if (currentAsync.length) {
        groups.push(currentAsync)
        currentAsync = []
      }
      groups.push([n])
    }
  }
  if (currentAsync.length) groups.push(currentAsync)
  return groups
}

function isAttemptFailure(r: ExecuteFlowResult): boolean {
  return (
    Boolean(r.error) || (r.statusCode !== null && r.statusCode >= 400)
  )
}

function effectiveRetry(node: AppNode): {
  maxRetries: number
  delayMs: number
  useBackoff: boolean
} {
  const rc = node.data.retryConfig
  return {
    maxRetries: Math.min(50, Math.max(0, Math.floor(rc?.maxRetries ?? 0))),
    delayMs: Math.min(600_000, Math.max(0, rc?.delayMs ?? 1000)),
    useBackoff: rc?.useExponentialBackoff ?? false,
  }
}

function attachRetryToSerializedData(
  dataOut: Record<string, unknown>,
  node: AppNode,
): void {
  const d = node.data as AnyFlowNodeData
  if (d.retryConfig) {
    dataOut.retry_config = {
      max_retries: d.retryConfig.maxRetries,
      delay_ms: d.retryConfig.delayMs,
      use_exponential_backoff: d.retryConfig.useExponentialBackoff,
    }
  }
  if (d.continueOnFail === true) {
    dataOut.continue_on_fail = true
  }
}

function toWaveContext(ctx: FlowExecutionContext): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(ctx)) {
    out[k] = { ...v.data }
  }
  return out
}

function serverPayloadFromResult(
  r: ExecuteFlowResult,
  node: AppNode | undefined,
): Record<string, unknown> {
  const kind = node?.type ?? "http"
  const timing = {
    duration_ms: r.durationMs,
    durationMs: r.durationMs,
  }
  const err = { error: r.error ?? null }
  const meta =
    r.attempts != null
      ? {
          attempts: r.attempts,
          outcome: r.outcome ?? null,
        }
      : {}

  if (kind === "http") {
    if (r.error && r.statusCode == null) {
      return { kind: "http", ...timing, ...err, ...meta }
    }
    return {
      kind: "http",
      status_code: r.statusCode,
      statusCode: r.statusCode,
      response_preview: r.responsePreview ?? null,
      responsePreview: r.responsePreview ?? null,
      ...timing,
      ...err,
      ...meta,
    }
  }

  if (kind === "condition") {
    return {
      kind: "condition",
      response_preview: r.responsePreview ?? null,
      responsePreview: r.responsePreview ?? null,
      status_code: r.statusCode,
      statusCode: r.statusCode,
      ...timing,
      ...err,
      ...meta,
    }
  }

  if (kind === "code") {
    return {
      kind: "code",
      response_preview: r.responsePreview ?? null,
      responsePreview: r.responsePreview ?? null,
      status_code: r.statusCode,
      statusCode: r.statusCode,
      ...timing,
      ...err,
      ...meta,
    }
  }

  return {
    kind: "trigger",
    response_preview: r.responsePreview ?? null,
    responsePreview: r.responsePreview ?? null,
    status_code: r.statusCode,
    statusCode: r.statusCode,
    ...timing,
    ...err,
    ...meta,
  }
}

function serializeResolvedNode(
  n: AppNode,
  ctx: FlowExecutionContext,
): Record<string, unknown> {
  switch (n.type) {
    case "http": {
      const dataOut: Record<string, unknown> = {
        method: n.data.method,
        url: resolveTemplate(n.data.url, ctx),
        headers: Object.fromEntries(
          Object.entries(n.data.headers).map(([k, v]) => [
            k,
            resolveTemplate(v, ctx),
          ]),
        ),
        body:
          n.data.body === null || n.data.body === ""
            ? null
            : resolveTemplate(n.data.body, ctx),
      }
      attachRetryToSerializedData(dataOut, n)
      return { id: n.id, type: "http", data: dataOut }
    }
    case "condition": {
      const dataOut: Record<string, unknown> = {
        expression: resolveTemplate(n.data.expression, ctx),
        eval_mode: n.data.evalMode,
      }
      attachRetryToSerializedData(dataOut, n)
      return { id: n.id, type: "condition", data: dataOut }
    }
    case "code": {
      const dataOut: Record<string, unknown> = {
        code: resolveTemplate(n.data.code, ctx),
        timeout_s: n.data.timeoutS,
        code_language: n.data.codeLanguage,
      }
      attachRetryToSerializedData(dataOut, n)
      return { id: n.id, type: "code", data: dataOut }
    }
    case "trigger": {
      const dataOut: Record<string, unknown> = {
        label: resolveTemplate(n.data.label, ctx),
        note:
          n.data.note && n.data.note.trim() !== ""
            ? resolveTemplate(n.data.note, ctx)
            : null,
      }
      attachRetryToSerializedData(dataOut, n)
      return { id: n.id, type: "trigger", data: dataOut }
    }
    default: {
      const _exhaustive: never = n
      return _exhaustive
    }
  }
}

async function fetchOneNodeResult(
  n: AppNode,
  flowCtx: FlowExecutionContext,
  waveUrl: string,
): Promise<ExecuteFlowResult> {
  const res = await fetch(waveUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nodes: [serializeResolvedNode(n, flowCtx)],
      context: toWaveContext(flowCtx),
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText || `HTTP ${res.status}`)
  }

  const json = (await res.json()) as ExecuteFlowResponse
  const first = json.results[0]
  if (!first) {
    throw new Error("No execution result returned")
  }
  return first
}

async function runNodeWithRetries(
  n: AppNode,
  flowCtx: FlowExecutionContext,
  waveUrl: string,
): Promise<ExecuteFlowResult> {
  const { maxRetries, delayMs, useBackoff } = effectiveRetry(n)
  let totalDuration = 0
  const attemptErrors: string[] = []
  let last: ExecuteFlowResult | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const wait = useBackoff ? delayMs * 2 ** (attempt - 1) : delayMs
      await sleep(wait)
    }
    try {
      const r = await fetchOneNodeResult(n, flowCtx, waveUrl)
      totalDuration += r.durationMs
      last = r
      if (!isAttemptFailure(r)) {
        return {
          ...r,
          durationMs: totalDuration,
          attempts: attempt + 1,
          outcome: "success",
          errorDetail: r.errorDetail ?? null,
        }
      }
      attemptErrors.push(
        r.error ??
          (r.statusCode != null ? `HTTP ${r.statusCode}` : "Request failed"),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      attemptErrors.push(msg)
      last = {
        nodeId: n.id,
        statusCode: null,
        durationMs: 0,
        error: msg,
      }
    }
  }

  const outcome: ExecutionOutcome =
    maxRetries > 0 ? "failed_after_retries" : "failed"
  const baseLast =
    last ??
    ({
      nodeId: n.id,
      statusCode: null,
      durationMs: 0,
      error: "Unknown failure",
    } satisfies ExecuteFlowResult)

  return {
    ...baseLast,
    durationMs: totalDuration,
    attempts: maxRetries + 1,
    outcome,
    attemptErrors: attemptErrors.length ? attemptErrors : undefined,
    error:
      baseLast.error ??
      attemptErrors[attemptErrors.length - 1] ??
      "Request failed",
  }
}

export async function executeFlowApi(
  nodes: AppNode[],
  edges: Edge[],
): Promise<ExecuteFlowResponse> {
  const plan = buildExecutionPlan(nodes, edges)
  if (!plan.ok) {
    throw new Error(plan.message)
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  let flowCtx: FlowExecutionContext = {}
  const allResults: ExecuteFlowResult[] = []
  const waveUrl = `${base.replace(/\/$/, "")}/execute-wave`

  for (const batch of plan.batches) {
    const waveNodes = batch.map((id) => nodeMap.get(id)!)
    const groups = splitWaveIntoExecutionGroups(waveNodes)
    const wavePairs: { r: ExecuteFlowResult; n: AppNode }[] = []

    for (const group of groups) {
      if (group.length === 1) {
        const n = group[0]!
        const r = await runNodeWithRetries(n, flowCtx, waveUrl)
        wavePairs.push({ r, n })
      } else {
        const rs = await Promise.all(
          group.map((n) => runNodeWithRetries(n, flowCtx, waveUrl)),
        )
        for (let i = 0; i < group.length; i++) {
          wavePairs.push({ r: rs[i]!, n: group[i]! })
        }
      }
    }

    let abortRest = false
    for (const { r, n } of wavePairs) {
      allResults.push(r)
      flowCtx[r.nodeId] = {
        data: serverPayloadFromResult(r, n),
      }
      if (isAttemptFailure(r) && n.data.continueOnFail !== true) {
        abortRest = true
      }
    }

    if (abortRest) break
  }

  return { results: allResults }
}
