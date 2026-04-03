import type { Node } from "@xyflow/react"

export type RunStatus = "idle" | "running" | "success" | "fail"

export type ApiNodeData = {
  label: string
  method: string
  url: string
  headers: Record<string, string>
  body: string | null
  runStatus: RunStatus
  lastStatusCode?: number
  lastLatencyMs?: number
  lastResponsePreview?: string
  lastError?: string
}

export type AppNode = Node<ApiNodeData, "api">

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
}
