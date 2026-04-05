import type { Edge } from "@xyflow/react"
import type { AppNode, RunLogEntry } from "@/types/flow"

/** Current on-disk / clipboard export format (increment when breaking). */
export const FLOW_FILE_EXPORT_VERSION = 1 as const

export type FlowViewportState = {
  x: number
  y: number
  zoom: number
}

export type FlowExportFileV1 = {
  flowcheckExportVersion: typeof FLOW_FILE_EXPORT_VERSION
  name: string
  exportedAt: string
  nodes: Array<{
    id: string
    type: string
    position: { x: number; y: number }
    data: unknown
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    type?: string
    animated?: boolean
    label?: unknown
  }>
  viewport?: FlowViewportState | null
}

export type NodeStressStats = {
  samples: number
  successes: number
  fails: number
  minMs: number
  maxMs: number
  avgMs: number
}

export type StressSummary = {
  id: string
  at: string
  iterations: number
  perNode: Record<string, NodeStressStats>
}

export type SavedWorkflow = {
  id: string
  name: string
  updatedAt: string
  nodes: AppNode[]
  edges: Edge[]
  lastRunLogs: RunLogEntry[]
  stressHistory: StressSummary[]
  /** Last known React Flow viewport (pan/zoom); updated on move end. */
  viewport?: FlowViewportState
}
