import type { Edge } from "@xyflow/react"
import type { AppNode } from "@/types/flow"

const base = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000"

export type ExecuteFlowResult = {
  nodeId: string
  statusCode: number | null
  durationMs: number
  responsePreview?: string | null
  error?: string | null
}

export type ExecuteFlowResponse = {
  results: ExecuteFlowResult[]
}

export async function executeFlowApi(
  nodes: AppNode[],
  edges: Edge[],
): Promise<ExecuteFlowResponse> {
  const payload = {
    nodes: nodes.map((n) => ({
      id: n.id,
      data: {
        method: n.data.method,
        url: n.data.url,
        headers: n.data.headers,
        body: n.data.body,
      },
    })),
    edges: edges.map((e) => ({ source: e.source, target: e.target })),
  }

  const res = await fetch(`${base.replace(/\/$/, "")}/execute-flow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText || `HTTP ${res.status}`)
  }

  return res.json() as Promise<ExecuteFlowResponse>
}
