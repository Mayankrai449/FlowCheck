import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ApiNodeData, AppNode, RunLogEntry } from "@/types/flow"

const defaultApiData = (): ApiNodeData => ({
  label: "API Request",
  method: "GET",
  url: "https://httpbin.org/get",
  headers: {},
  body: null,
  runStatus: "idle",
})

type WorkflowState = {
  nodes: AppNode[]
  edges: Edge[]
  resultsOpen: boolean
  curlTargetNodeId: string | null
  runInFlight: boolean
  lastRunLogs: RunLogEntry[]
}

type WorkflowActions = {
  setResultsOpen: (open: boolean) => void
  setCurlTarget: (id: string | null) => void
  addApiNode: () => void
  updateNodeData: (id: string, data: Partial<ApiNodeData>) => void
  onNodesChange: (changes: NodeChange<AppNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (conn: Connection) => void
  setRunInFlight: (v: boolean) => void
  setLastRunLogs: (logs: RunLogEntry[]) => void
  applyExecutionResults: (
    results: Array<{
      nodeId: string
      statusCode: number | null
      durationMs: number
      responsePreview?: string | null
      error?: string | null
    }>,
  ) => void
  resetGraphRunUi: () => void
  abortRunUi: () => void
  removeNode: (id: string) => void
}

const nextPosition = (nodes: AppNode[]): { x: number; y: number } => {
  const n = nodes.length
  return { x: 80 + (n % 4) * 60, y: 80 + Math.floor(n / 4) * 140 }
}

export const useWorkflowStore = create<WorkflowState & WorkflowActions>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      resultsOpen: true,
      curlTargetNodeId: null,
      runInFlight: false,
      lastRunLogs: [],

      setResultsOpen: (open) => set({ resultsOpen: open }),
      setCurlTarget: (id) => set({ curlTargetNodeId: id }),

      addApiNode: () => {
        const { nodes } = get()
        const id = crypto.randomUUID()
        const pos = nextPosition(nodes)
        const node: AppNode = {
          id,
          type: "api",
          position: pos,
          data: defaultApiData(),
        }
        set({ nodes: [...nodes, node] })
      },

      updateNodeData: (id, data) => {
        set({
          nodes: get().nodes.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, ...data } }
              : n,
          ),
        })
      },

      onNodesChange: (changes) =>
        set({
          nodes: applyNodeChanges(changes, get().nodes),
        }),

      onEdgesChange: (changes) =>
        set({
          edges: applyEdgeChanges(changes, get().edges),
        }),

      onConnect: (conn) =>
        set({
          edges: addEdge(conn, get().edges),
        }),

      setRunInFlight: (v) => set({ runInFlight: v }),

      setLastRunLogs: (logs) => set({ lastRunLogs: logs }),

      resetGraphRunUi: () => {
        set({
          nodes: get().nodes.map((n) => ({
            ...n,
            data: {
              ...n.data,
              runStatus: "running" as const,
              lastStatusCode: undefined,
              lastLatencyMs: undefined,
              lastResponsePreview: undefined,
              lastError: undefined,
            },
          })),
        })
      },

      abortRunUi: () => {
        set({
          nodes: get().nodes.map((n) => ({
            ...n,
            data: {
              ...n.data,
              runStatus: "idle" as const,
            },
          })),
        })
      },

      removeNode: (id) => {
        set({
          nodes: get().nodes.filter((n) => n.id !== id),
          edges: get().edges.filter((e) => e.source !== id && e.target !== id),
        })
      },

      applyExecutionResults: (results) => {
        const { nodes } = get()
        const byId = new Map(results.map((r) => [r.nodeId, r]))
        const newLogs: RunLogEntry[] = []

        const nextNodes = nodes.map((n) => {
          const r = byId.get(n.id)
          if (!r) {
            return {
              ...n,
              data: {
                ...n.data,
                runStatus: "idle" as const,
              },
            }
          }
          const fail = Boolean(r.error) || (r.statusCode !== null && r.statusCode >= 400)
          const status: ApiNodeData["runStatus"] = fail ? "fail" : "success"
          const line: RunLogEntry = {
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            nodeId: n.id,
            method: n.data.method,
            url: n.data.url,
            statusCode: r.statusCode ?? undefined,
            durationMs: r.durationMs,
            error: r.error ?? undefined,
            detail: r.error
              ? `Error: ${r.error}`
              : `${r.statusCode ?? "?"} in ${r.durationMs.toFixed(1)}ms`,
          }
          newLogs.push(line)
          return {
            ...n,
            data: {
              ...n.data,
              runStatus: status,
              lastStatusCode: r.statusCode ?? undefined,
              lastLatencyMs: r.durationMs,
              lastResponsePreview: r.responsePreview ?? undefined,
              lastError: r.error ?? undefined,
            },
          }
        })

        set({
          nodes: nextNodes,
          lastRunLogs: [...newLogs, ...get().lastRunLogs].slice(0, 200),
        })
      },
    }),
    {
      name: "flowcheck-workflow",
      partialize: (s) => ({
        nodes: s.nodes,
        edges: s.edges,
        resultsOpen: s.resultsOpen,
        lastRunLogs: s.lastRunLogs,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as WorkflowState),
        curlTargetNodeId: null,
        runInFlight: false,
      }),
    },
  ),
)
