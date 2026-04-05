import type { Edge } from "@xyflow/react"
import type { AppNode, RunLogEntry } from "@/types/flow"

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
}
