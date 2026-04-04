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
import type { SavedWorkflow, StressSummary } from "@/types/workflow"

const defaultApiData = (): ApiNodeData => ({
  label: "API Request",
  method: "GET",
  url: "https://httpbin.org/get",
  headers: {},
  body: null,
  runStatus: "idle",
})

function newSavedWorkflow(name: string): SavedWorkflow {
  const id = crypto.randomUUID()
  return {
    id,
    name,
    updatedAt: new Date().toISOString(),
    nodes: [],
    edges: [],
    lastRunLogs: [],
    stressHistory: [],
  }
}

function remapWorkflowGraph(
  nodes: AppNode[],
  edges: Edge[],
): { nodes: AppNode[]; edges: Edge[] } {
  const idMap = new Map<string, string>()
  const newNodes = nodes.map((n) => {
    const newId = crypto.randomUUID()
    idMap.set(n.id, newId)
    return { ...n, id: newId }
  })
  const newEdges = edges.map((e) => ({
    ...e,
    id: crypto.randomUUID(),
    source: idMap.get(e.source) ?? e.source,
    target: idMap.get(e.target) ?? e.target,
  }))
  return { nodes: newNodes, edges: newEdges }
}

const nextPosition = (nodes: AppNode[]): { x: number; y: number } => {
  const n = nodes.length
  return { x: 80 + (n % 4) * 60, y: 80 + Math.floor(n / 4) * 140 }
}

type PersistedV1 = {
  nodes?: AppNode[]
  edges?: Edge[]
  resultsOpen?: boolean
  lastRunLogs?: RunLogEntry[]
}

type WorkflowRootState = {
  workflows: Record<string, SavedWorkflow>
  activeWorkflowId: string
  resultsOpen: boolean
  curlTargetNodeId: string | null
  runInFlight: boolean
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
  createWorkflow: (name?: string) => void
  setActiveWorkflow: (id: string) => void
  renameWorkflow: (id: string, name: string) => void
  duplicateWorkflow: (id: string) => void
  deleteWorkflow: (id: string) => boolean
  appendStressSummary: (summary: StressSummary) => void
}

function initialRoot(): WorkflowRootState {
  const wf = newSavedWorkflow("Default")
  return {
    workflows: { [wf.id]: wf },
    activeWorkflowId: wf.id,
    resultsOpen: true,
    curlTargetNodeId: null,
    runInFlight: false,
  }
}

export const useWorkflowStore = create<
  WorkflowRootState & WorkflowActions
>()(
  persist(
    (set, get) => ({
      ...initialRoot(),

      setResultsOpen: (open) => set({ resultsOpen: open }),
      setCurlTarget: (id) => set({ curlTargetNodeId: id }),

      createWorkflow: (name) => {
        const s = get()
        const n =
          name?.trim() ||
          `Workflow ${Object.keys(s.workflows).length + 1}`
        const wf = newSavedWorkflow(n)
        set({
          workflows: { ...s.workflows, [wf.id]: wf },
          activeWorkflowId: wf.id,
          curlTargetNodeId: null,
        })
      },

      setActiveWorkflow: (id) => {
        const s = get()
        if (!s.workflows[id]) return
        set({ activeWorkflowId: id, curlTargetNodeId: null })
      },

      renameWorkflow: (id, name) => {
        const s = get()
        const wf = s.workflows[id]
        if (!wf) return
        const next = name.trim() || wf.name
        set({
          workflows: {
            ...s.workflows,
            [id]: { ...wf, name: next, updatedAt: new Date().toISOString() },
          },
        })
      },

      duplicateWorkflow: (sourceId) => {
        const s = get()
        const src = s.workflows[sourceId]
        if (!src) return
        const { nodes, edges } = remapWorkflowGraph(src.nodes, src.edges)
        const copy = newSavedWorkflow(`${src.name} copy`)
        const wf: SavedWorkflow = {
          ...copy,
          nodes,
          edges,
        }
        set({
          workflows: { ...s.workflows, [wf.id]: wf },
          activeWorkflowId: wf.id,
          curlTargetNodeId: null,
        })
      },

      deleteWorkflow: (id) => {
        const s = get()
        const keys = Object.keys(s.workflows)
        if (keys.length <= 1) return false
        if (!s.workflows[id]) return false
        const rest: Record<string, SavedWorkflow> = {}
        for (const [k, v] of Object.entries(s.workflows)) {
          if (k !== id) rest[k] = v
        }
        let nextActive = s.activeWorkflowId
        if (nextActive === id) {
          nextActive = Object.keys(rest)[0]
        }
        set({
          workflows: rest,
          activeWorkflowId: nextActive,
          curlTargetNodeId: null,
        })
        return true
      },

      appendStressSummary: (summary) => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) return
        const stressHistory = [summary, ...wf.stressHistory].slice(0, 30)
        set({
          workflows: {
            ...s.workflows,
            [wf.id]: {
              ...wf,
              stressHistory,
              updatedAt: new Date().toISOString(),
            },
          },
        })
      },

      addApiNode: () => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) return
        const id = crypto.randomUUID()
        const pos = nextPosition(wf.nodes)
        const node: AppNode = {
          id,
          type: "api",
          position: pos,
          data: defaultApiData(),
        }
        set({
          workflows: {
            ...s.workflows,
            [wf.id]: {
              ...wf,
              nodes: [...wf.nodes, node],
              updatedAt: new Date().toISOString(),
            },
          },
        })
      },

      updateNodeData: (id, data) => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) return
        set({
          workflows: {
            ...s.workflows,
            [wf.id]: {
              ...wf,
              nodes: wf.nodes.map((n) =>
                n.id === id
                  ? { ...n, data: { ...n.data, ...data } }
                  : n,
              ),
              updatedAt: new Date().toISOString(),
            },
          },
        })
      },

      onNodesChange: (changes) => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) return
        set({
          workflows: {
            ...s.workflows,
            [wf.id]: {
              ...wf,
              nodes: applyNodeChanges(changes, wf.nodes),
              updatedAt: new Date().toISOString(),
            },
          },
        })
      },

      onEdgesChange: (changes) => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) return
        set({
          workflows: {
            ...s.workflows,
            [wf.id]: {
              ...wf,
              edges: applyEdgeChanges(changes, wf.edges),
              updatedAt: new Date().toISOString(),
            },
          },
        })
      },

      onConnect: (conn) => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) return
        set({
          workflows: {
            ...s.workflows,
            [wf.id]: {
              ...wf,
              edges: addEdge(conn, wf.edges),
              updatedAt: new Date().toISOString(),
            },
          },
        })
      },

      setRunInFlight: (v) => set({ runInFlight: v }),

      setLastRunLogs: (logs) => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) return
        set({
          workflows: {
            ...s.workflows,
            [wf.id]: {
              ...wf,
              lastRunLogs: logs,
              updatedAt: new Date().toISOString(),
            },
          },
        })
      },

      resetGraphRunUi: () => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) return
        set({
          workflows: {
            ...s.workflows,
            [wf.id]: {
              ...wf,
              nodes: wf.nodes.map((n) => ({
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
              updatedAt: new Date().toISOString(),
            },
          },
        })
      },

      abortRunUi: () => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) return
        set({
          workflows: {
            ...s.workflows,
            [wf.id]: {
              ...wf,
              nodes: wf.nodes.map((n) => ({
                ...n,
                data: {
                  ...n.data,
                  runStatus: "idle" as const,
                },
              })),
              updatedAt: new Date().toISOString(),
            },
          },
        })
      },

      removeNode: (id) => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) return
        set({
          workflows: {
            ...s.workflows,
            [wf.id]: {
              ...wf,
              nodes: wf.nodes.filter((n) => n.id !== id),
              edges: wf.edges.filter((e) => e.source !== id && e.target !== id),
              updatedAt: new Date().toISOString(),
            },
          },
        })
      },

      applyExecutionResults: (results) => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) return
        const byId = new Map(results.map((r) => [r.nodeId, r]))
        const newLogs: RunLogEntry[] = []

        const nextNodes = wf.nodes.map((n) => {
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
          const fail =
            Boolean(r.error) ||
            (r.statusCode !== null && r.statusCode >= 400)
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
          workflows: {
            ...s.workflows,
            [wf.id]: {
              ...wf,
              nodes: nextNodes,
              lastRunLogs: [...newLogs, ...wf.lastRunLogs].slice(0, 200),
              updatedAt: new Date().toISOString(),
            },
          },
        })
      },
    }),
    {
      name: "flowcheck-workflow",
      partialize: (s) => ({
        workflows: s.workflows,
        activeWorkflowId: s.activeWorkflowId,
        resultsOpen: s.resultsOpen,
      }),
      merge: (persisted, current) => {
        const p = persisted as PersistedV1 & Partial<WorkflowRootState>
        if (
          p.workflows &&
          p.activeWorkflowId &&
          p.workflows[p.activeWorkflowId]
        ) {
          return {
            ...current,
            workflows: p.workflows,
            activeWorkflowId: p.activeWorkflowId,
            resultsOpen: p.resultsOpen ?? true,
            curlTargetNodeId: null,
            runInFlight: false,
          }
        }
        if (Array.isArray(p.nodes)) {
          const wf = newSavedWorkflow("Default")
          const migrated: SavedWorkflow = {
            ...wf,
            nodes: p.nodes,
            edges: Array.isArray(p.edges) ? p.edges : [],
            lastRunLogs: Array.isArray(p.lastRunLogs) ? p.lastRunLogs : [],
            stressHistory: [],
          }
          return {
            ...current,
            workflows: { [migrated.id]: migrated },
            activeWorkflowId: migrated.id,
            resultsOpen: p.resultsOpen ?? true,
            curlTargetNodeId: null,
            runInFlight: false,
          }
        }
        return current
      },
    },
  ),
)

export function selectActiveWorkflow(
  s: WorkflowRootState & WorkflowActions,
): SavedWorkflow | undefined {
  return s.workflows[s.activeWorkflowId]
}
