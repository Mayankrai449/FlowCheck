import type { Node } from "@xyflow/react"

export type RunStatus = "idle" | "running" | "success" | "fail"

export type ExecutionOutcome =
  | "success"
  | "failed"
  | "failed_after_retries"

export const FLOW_NODE_KINDS = ["http", "condition", "code", "trigger"] as const
export type FlowNodeKind = (typeof FLOW_NODE_KINDS)[number]

export type NodeRetryConfig = {
  maxRetries: number
  delayMs: number
  useExponentialBackoff: boolean
}

type BaseFlowNodeData = {
  label: string
  runStatus: RunStatus
  lastStatusCode?: number
  lastLatencyMs?: number
  lastResponsePreview?: string
  lastError?: string
  lastAttempts?: number
  lastOutcome?: ExecutionOutcome
  retryConfig?: NodeRetryConfig
  continueOnFail?: boolean
}

/** `url`, `headers` values, and `body` may include `{{ $node["id"].data.key }}` templates. */
export type HttpNodeData = BaseFlowNodeData & {
  method: string
  url: string
  headers: Record<string, string>
  body: string | null
}

export type ConditionEvalMode = "safe_expr" | "python_sandbox"

export type ConditionNodeData = BaseFlowNodeData & {
  expression: string
  evalMode: ConditionEvalMode
}

export type CodeNodeData = BaseFlowNodeData & {
  code: string
  timeoutS: number
}

export type TriggerNodeData = BaseFlowNodeData & {
  note: string
}

export type AppNode =
  | Node<HttpNodeData, "http">
  | Node<ConditionNodeData, "condition">
  | Node<CodeNodeData, "code">
  | Node<TriggerNodeData, "trigger">

export type AnyFlowNodeData =
  | HttpNodeData
  | ConditionNodeData
  | CodeNodeData
  | TriggerNodeData

export type RunLogEntry = {
  id: string
  at: string
  nodeId: string
  method: string
  url: string
  statusCode?: number
  durationMs?: number
  error?: string
  detail: string
  attempts?: number
  outcome?: ExecutionOutcome
  errorDetail?: string
}

/** Per-node outputs for `{{ $node["id"].data.* }}` templating (key = node.id). */
export type FlowExecutionContextEntry = {
  data: Record<string, unknown>
}

export type FlowExecutionContext = Record<string, FlowExecutionContextEntry>

export function defaultHttpData(): HttpNodeData {
  return {
    label: "HTTP Request",
    method: "GET",
    url: "https://httpbin.org/get",
    headers: {},
    body: null,
    runStatus: "idle",
  }
}

export function defaultConditionData(): ConditionNodeData {
  return {
    label: "Condition",
    expression: "True",
    evalMode: "safe_expr",
    runStatus: "idle",
  }
}

export function defaultCodeData(): CodeNodeData {
  return {
    label: "Code",
    code: 'result = {"ok": True}',
    timeoutS: 5,
    runStatus: "idle",
  }
}

export function defaultTriggerData(): TriggerNodeData {
  return {
    label: "Trigger",
    note: "",
    runStatus: "idle",
  }
}

export function defaultDataForKind(kind: FlowNodeKind): AnyFlowNodeData {
  switch (kind) {
    case "http":
      return defaultHttpData()
    case "condition":
      return defaultConditionData()
    case "code":
      return defaultCodeData()
    case "trigger":
      return defaultTriggerData()
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** Optional retry / continue flags from persisted or API-shaped data. */
export function migrateRetryFields(data: Record<string, unknown>): Pick<
  BaseFlowNodeData,
  "retryConfig" | "continueOnFail"
> {
  const rcRaw = data.retryConfig ?? data.retry_config
  const out: Pick<BaseFlowNodeData, "retryConfig" | "continueOnFail"> = {}
  if (isRecord(rcRaw)) {
    const maxR = rcRaw.maxRetries ?? rcRaw.max_retries
    const delay = rcRaw.delayMs ?? rcRaw.delay_ms
    const bo = rcRaw.useExponentialBackoff ?? rcRaw.use_exponential_backoff
    if (
      typeof maxR === "number" ||
      typeof delay === "number" ||
      typeof bo === "boolean"
    ) {
      out.retryConfig = {
        maxRetries:
          typeof maxR === "number" && Number.isFinite(maxR)
            ? Math.min(50, Math.max(0, Math.floor(maxR)))
            : 0,
        delayMs:
          typeof delay === "number" && Number.isFinite(delay)
            ? Math.min(600_000, Math.max(0, delay))
            : 1000,
        useExponentialBackoff: bo === true,
      }
    }
  }
  const cf = data.continueOnFail ?? data.continue_on_fail
  if (cf === true) out.continueOnFail = true
  if (cf === false) out.continueOnFail = false
  return out
}

/**
 * Normalizes persisted or legacy nodes (e.g. React Flow type `api` → `http`).
 */
export function migrateAppNode(raw: unknown): AppNode {
  if (!isRecord(raw)) {
    return {
      id: crypto.randomUUID(),
      type: "http",
      position: { x: 0, y: 0 },
      data: defaultHttpData(),
    }
  }

  const id = typeof raw.id === "string" ? raw.id : crypto.randomUUID()
  const pos = isRecord(raw.position)
    ? {
        x: Number(raw.position.x) || 0,
        y: Number(raw.position.y) || 0,
      }
    : { x: 0, y: 0 }

  const tRaw = raw.type
  const kind = coerceFlowKind(tRaw)
  const data = isRecord(raw.data) ? raw.data : {}

  if (kind === "http") {
    return {
      id,
      type: "http",
      position: pos,
      data: {
        ...defaultHttpData(),
        label: typeof data.label === "string" ? data.label : defaultHttpData().label,
        method: typeof data.method === "string" ? data.method : "GET",
        url: typeof data.url === "string" ? data.url : defaultHttpData().url,
        headers: isRecord(data.headers)
          ? (data.headers as Record<string, string>)
          : {},
        body: typeof data.body === "string" || data.body === null ? data.body : null,
        runStatus:
          data.runStatus === "idle" ||
          data.runStatus === "running" ||
          data.runStatus === "success" ||
          data.runStatus === "fail"
            ? data.runStatus
            : "idle",
        lastStatusCode:
          typeof data.lastStatusCode === "number"
            ? data.lastStatusCode
            : undefined,
        lastLatencyMs:
          typeof data.lastLatencyMs === "number"
            ? data.lastLatencyMs
            : undefined,
        lastResponsePreview:
          typeof data.lastResponsePreview === "string"
            ? data.lastResponsePreview
            : undefined,
        lastError:
          typeof data.lastError === "string" ? data.lastError : undefined,
        ...migrateRetryFields(data),
      },
    }
  }

  if (kind === "condition") {
    const emRaw = data.evalMode ?? data.eval_mode
    const em =
      emRaw === "safe_expr" || emRaw === "python_sandbox" ? emRaw : "safe_expr"
    return {
      id,
      type: "condition",
      position: pos,
      data: {
        ...defaultConditionData(),
        label:
          typeof data.label === "string" ? data.label : defaultConditionData().label,
        expression:
          typeof data.expression === "string"
            ? data.expression
            : defaultConditionData().expression,
        evalMode: em,
        runStatus:
          data.runStatus === "idle" ||
          data.runStatus === "running" ||
          data.runStatus === "success" ||
          data.runStatus === "fail"
            ? data.runStatus
            : "idle",
        lastStatusCode:
          typeof data.lastStatusCode === "number"
            ? data.lastStatusCode
            : undefined,
        lastLatencyMs:
          typeof data.lastLatencyMs === "number"
            ? data.lastLatencyMs
            : undefined,
        lastResponsePreview:
          typeof data.lastResponsePreview === "string"
            ? data.lastResponsePreview
            : undefined,
        lastError:
          typeof data.lastError === "string" ? data.lastError : undefined,
        ...migrateRetryFields(data),
      },
    }
  }

  if (kind === "code") {
    return {
      id,
      type: "code",
      position: pos,
      data: {
        ...defaultCodeData(),
        label: typeof data.label === "string" ? data.label : defaultCodeData().label,
        code: typeof data.code === "string" ? data.code : defaultCodeData().code,
        timeoutS: (() => {
          const ts = data.timeoutS ?? data.timeout_s
          return typeof ts === "number" && Number.isFinite(ts)
            ? Math.min(30, Math.max(0.5, ts))
            : 5
        })(),
        runStatus:
          data.runStatus === "idle" ||
          data.runStatus === "running" ||
          data.runStatus === "success" ||
          data.runStatus === "fail"
            ? data.runStatus
            : "idle",
        lastStatusCode:
          typeof data.lastStatusCode === "number"
            ? data.lastStatusCode
            : undefined,
        lastLatencyMs:
          typeof data.lastLatencyMs === "number"
            ? data.lastLatencyMs
            : undefined,
        lastResponsePreview:
          typeof data.lastResponsePreview === "string"
            ? data.lastResponsePreview
            : undefined,
        lastError:
          typeof data.lastError === "string" ? data.lastError : undefined,
        ...migrateRetryFields(data),
      },
    }
  }

  if (kind === "trigger") {
    return {
      id,
      type: "trigger",
      position: pos,
      data: {
        ...defaultTriggerData(),
        label:
          typeof data.label === "string" ? data.label : defaultTriggerData().label,
        note: typeof data.note === "string" ? data.note : "",
        runStatus:
          data.runStatus === "idle" ||
          data.runStatus === "running" ||
          data.runStatus === "success" ||
          data.runStatus === "fail"
            ? data.runStatus
            : "idle",
        lastStatusCode:
          typeof data.lastStatusCode === "number"
            ? data.lastStatusCode
            : undefined,
        lastLatencyMs:
          typeof data.lastLatencyMs === "number"
            ? data.lastLatencyMs
            : undefined,
        lastResponsePreview:
          typeof data.lastResponsePreview === "string"
            ? data.lastResponsePreview
            : undefined,
        lastError:
          typeof data.lastError === "string" ? data.lastError : undefined,
        ...migrateRetryFields(data),
      },
    }
  }

  return {
    id,
    type: "http",
    position: pos,
    data: defaultHttpData(),
  }
}

export function migrateSavedWorkflowNodes(nodes: unknown[]): AppNode[] {
  if (!Array.isArray(nodes)) return []
  return nodes.map((n) => migrateAppNode(n))
}

function coerceFlowKind(tRaw: unknown): FlowNodeKind {
  if (tRaw === "api" || tRaw === undefined) return "http"
  if (
    typeof tRaw === "string" &&
    (FLOW_NODE_KINDS as readonly string[]).includes(tRaw)
  ) {
    return tRaw as FlowNodeKind
  }
  return "http"
}
