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
import { buildExecutionPlan } from "@/lib/executionPlan"
import type {
  AnyFlowNodeData,
  AppNode,
  ExecutionOutcome,
  FlowNodeKind,
  RunLogEntry,
} from "@/types/flow"
import {
  defaultDataForKind,
  migrateSavedWorkflowNodes,
} from "@/types/flow"
import {
  FLOW_FILE_EXPORT_VERSION,
  type FlowExportFileV1,
  type FlowViewportState,
  type SavedWorkflow,
  type StressSummary,
} from "@/types/workflow"

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

function parseFlowFile(data: unknown): {
  name?: string
  nodes: unknown[]
  edges: unknown[]
  viewport?: FlowViewportState
} | null {
  if (!data || typeof data !== "object") return null
  const o = data as Record<string, unknown>
  if (!Array.isArray(o.nodes) || !Array.isArray(o.edges)) return null
  const name =
    typeof o.name === "string" && o.name.trim() ? o.name.trim() : undefined
  let viewport: FlowViewportState | undefined
  if (o.viewport != null && typeof o.viewport === "object") {
    const v = o.viewport as Record<string, unknown>
    const x = Number(v.x)
    const y = Number(v.y)
    const zoom = Number(v.zoom)
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(zoom)) {
      viewport = { x, y, zoom }
    }
  }
  return { name, nodes: o.nodes, edges: o.edges, viewport }
}

function normalizeLoadedEdges(raw: unknown): Edge[] {
  if (!Array.isArray(raw)) return []
  const out: Edge[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const e = item as Record<string, unknown>
    if (typeof e.source !== "string" || typeof e.target !== "string") continue
    out.push({
      id: typeof e.id === "string" ? e.id : crypto.randomUUID(),
      source: e.source,
      target: e.target,
      ...(typeof e.type === "string" ? { type: e.type } : {}),
      ...(e.animated === true ? { animated: true } : {}),
      ...(e.label !== undefined ? { label: e.label as Edge["label"] } : {}),
    })
  }
  return out
}

function cloneForExport<T>(value: T): T {
  try {
    return structuredClone(value)
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
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
  selectedNodeId: string | null
  /** Bumps when the active workflow graph is loaded/replaced so the canvas can apply viewport. */
  flowLoadNonce: number
}

type WorkflowActions = {
  setResultsOpen: (open: boolean) => void
  setCurlTarget: (id: string | null) => void
  setSelectedNodeId: (id: string | null) => void
  addNode: (kind: FlowNodeKind) => void
  addNodeAt: (kind: FlowNodeKind, position: { x: number; y: number }) => void
  updateNodeData: (id: string, data: Partial<AnyFlowNodeData>) => void
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
      errorDetail?: string | null
      attempts?: number
      outcome?: ExecutionOutcome
      attemptErrors?: string[]
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
  saveFlow: () => FlowExportFileV1 | null
  loadFlow: (jsonData: unknown) => { ok: true } | { ok: false; message: string }
  clearActiveWorkflowGraph: () => void
  setWorkflowViewport: (vp: FlowViewportState) => void
  applyAutoLayout: () => { ok: true } | { ok: false; message: string }
}

function initialRoot(): WorkflowRootState {
  const wf = newSavedWorkflow("Default")
  return {
    workflows: { [wf.id]: wf },
    activeWorkflowId: wf.id,
    resultsOpen: true,
    curlTargetNodeId: null,
    runInFlight: false,
    selectedNodeId: null,
    flowLoadNonce: 0,
  }
}

function migrateWorkflowRecord(wf: SavedWorkflow): SavedWorkflow {
  return {
    ...wf,
    nodes: migrateSavedWorkflowNodes(wf.nodes as unknown[]),
    edges: wf.edges.map((e) => ({
      ...e,
      type: e.type === "smoothstep" || !e.type ? "deletable" : e.type,
    })),
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
      setSelectedNodeId: (id) => set({ selectedNodeId: id }),

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
          selectedNodeId: null,
        })
      },

      setActiveWorkflow: (id) => {
        const s = get()
        if (!s.workflows[id]) return
        set({
          activeWorkflowId: id,
          curlTargetNodeId: null,
          selectedNodeId: null,
        })
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
          viewport: src.viewport,
        }
        set({
          workflows: { ...s.workflows, [wf.id]: wf },
          activeWorkflowId: wf.id,
          curlTargetNodeId: null,
          selectedNodeId: null,
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
          selectedNodeId: null,
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

      saveFlow: () => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) return null
        const nodes = wf.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: { x: n.position.x, y: n.position.y },
          data: cloneForExport(n.data),
        }))
        const edges = wf.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type,
          animated: e.animated,
          label: e.label,
        }))
        const payload: FlowExportFileV1 = {
          flowcheckExportVersion: FLOW_FILE_EXPORT_VERSION,
          name: wf.name,
          exportedAt: new Date().toISOString(),
          nodes,
          edges,
          viewport: wf.viewport ?? null,
        }
        return payload
      },

      loadFlow: (jsonData) => {
        const parsed = parseFlowFile(jsonData)
        if (!parsed) {
          return {
            ok: false,
            message:
              "Invalid flow file: expected JSON with nodes and edges arrays.",
          }
        }
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) {
          return { ok: false, message: "No active workflow." }
        }
        const nodes = migrateSavedWorkflowNodes(parsed.nodes)
        const edges = normalizeLoadedEdges(parsed.edges)
        const nextName = parsed.name ?? wf.name
        set({
          selectedNodeId: null,
          curlTargetNodeId: null,
          workflows: {
            ...s.workflows,
            [wf.id]: {
              ...wf,
              name: nextName,
              nodes,
              edges,
              viewport: parsed.viewport,
              lastRunLogs: [],
              stressHistory: [],
              updatedAt: new Date().toISOString(),
            },
          },
          flowLoadNonce: s.flowLoadNonce + 1,
        })
        return { ok: true }
      },

      clearActiveWorkflowGraph: () => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) return
        set({
          selectedNodeId: null,
          curlTargetNodeId: null,
          workflows: {
            ...s.workflows,
            [wf.id]: {
              ...wf,
              nodes: [],
              edges: [],
              viewport: undefined,
              lastRunLogs: [],
              stressHistory: [],
              updatedAt: new Date().toISOString(),
            },
          },
          flowLoadNonce: s.flowLoadNonce + 1,
        })
      },

      setWorkflowViewport: (vp) => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) return
        set({
          workflows: {
            ...s.workflows,
            [wf.id]: {
              ...wf,
              viewport: vp,
              updatedAt: new Date().toISOString(),
            },
          },
        })
      },

      applyAutoLayout: () => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) {
          return { ok: false, message: "No active workflow." }
        }
        const plan = buildExecutionPlan(wf.nodes, wf.edges)
        if (!plan.ok) {
          return { ok: false, message: plan.message }
        }
        const colW = 300
        const rowH = 200
        const idToPos = new Map<string, { x: number; y: number }>()
        for (let row = 0; row < plan.batches.length; row++) {
          const batch = plan.batches[row]!
          const n = batch.length
          const rowW = n > 1 ? (n - 1) * colW : 0
          const baseX = 320 - rowW / 2
          for (let col = 0; col < n; col++) {
            idToPos.set(batch[col]!, {
              x: baseX + col * colW,
              y: 80 + row * rowH,
            })
          }
        }
        const nextNodes = wf.nodes.map((n) => {
          const p = idToPos.get(n.id)
          return p ? { ...n, position: p } : n
        })
        set({
          workflows: {
            ...s.workflows,
            [wf.id]: {
              ...wf,
              nodes: nextNodes,
              viewport: undefined,
              updatedAt: new Date().toISOString(),
            },
          },
          flowLoadNonce: s.flowLoadNonce + 1,
        })
        return { ok: true }
      },

      addNode: (kind) => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) return
        const id = crypto.randomUUID()
        const pos = nextPosition(wf.nodes)
        const node: AppNode = {
          id,
          type: kind,
          position: pos,
          data: defaultDataForKind(kind),
        } as AppNode
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

      addNodeAt: (kind, position) => {
        const s = get()
        const wf = s.workflows[s.activeWorkflowId]
        if (!wf) return
        const id = crypto.randomUUID()
        const node: AppNode = {
          id,
          type: kind,
          position,
          data: defaultDataForKind(kind),
        } as AppNode
        set({
          workflows: {
            ...s.workflows,
            [wf.id]: {
              ...wf,
              nodes: [...wf.nodes, node],
              updatedAt: new Date().toISOString(),
            },
          },
          selectedNodeId: id,
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
                  ? ({ ...n, data: { ...n.data, ...data } } as AppNode)
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
        const removed = changes
          .filter((c) => c.type === "remove")
          .map((c) => c.id)
        const nextSelected =
          removed.includes(s.selectedNodeId ?? "") ? null : s.selectedNodeId
        set({
          selectedNodeId: nextSelected,
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
              nodes: wf.nodes.map(
                (n) =>
                  ({
                    ...n,
                    data: {
                      ...n.data,
                      runStatus: "running" as const,
                      lastStatusCode: undefined,
                      lastLatencyMs: undefined,
                      lastResponsePreview: undefined,
                      lastError: undefined,
                      lastAttempts: undefined,
                      lastOutcome: undefined,
                    },
                  }) as AppNode,
              ),
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
              nodes: wf.nodes.map(
                (n) =>
                  ({
                    ...n,
                    data: {
                      ...n.data,
                      runStatus: "idle" as const,
                      lastAttempts: undefined,
                      lastOutcome: undefined,
                    },
                  }) as AppNode,
              ),
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
          selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
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

        const nextNodes = wf.nodes.map((n): AppNode => {
          const r = byId.get(n.id)
          if (!r) {
            return {
              ...n,
              data: {
                ...n.data,
                runStatus: "idle" as const,
                lastAttempts: undefined,
                lastOutcome: undefined,
              },
            } as AppNode
          }
          const fail =
            r.outcome === "failed" || r.outcome === "failed_after_retries"
              ? true
              : r.outcome === "success"
                ? false
                : Boolean(r.error) ||
                  (r.statusCode !== null && r.statusCode >= 400)
          const status: AnyFlowNodeData["runStatus"] = fail ? "fail" : "success"

          let method = "NODE"
          let url = ""
          if (n.type === "http") {
            method = n.data.method
            url = n.data.url
          } else if (n.type === "condition") {
            method = "Condition"
            url =
              n.data.expression.length > 120
                ? `${n.data.expression.slice(0, 118)}…`
                : n.data.expression
          } else if (n.type === "code") {
            method = "Code"
            const line = n.data.code.split("\n").find((l) => l.trim()) ?? ""
            url =
              line.length > 120 ? `${line.slice(0, 118)}…` : line || "(empty)"
          } else if (n.type === "trigger") {
            method = "Trigger"
            url = n.data.note?.trim() ? n.data.note : n.data.label
          }

          const outcomeLabel =
            r.outcome === "success"
              ? (r.attempts ?? 1) > 1
                ? `Success (${r.attempts} attempts)`
                : "Success"
              : r.outcome === "failed_after_retries"
                ? `Failed after retries (${r.attempts ?? "?"})`
                : r.outcome === "failed"
                  ? "Failed"
                  : null

          let detail =
            outcomeLabel != null
              ? `${outcomeLabel} · ${
                  r.error
                    ? r.error
                    : `${r.statusCode ?? "?"} in ${r.durationMs.toFixed(1)}ms`
                }`
              : r.error
                ? `Error: ${r.error}`
                : `${r.statusCode ?? "?"} in ${r.durationMs.toFixed(1)}ms`

          if (r.attemptErrors && r.attemptErrors.length > 1) {
            const joined = r.attemptErrors.join(" | ")
            detail +=
              joined.length > 320
                ? ` · Attempts: ${joined.slice(0, 320)}…`
                : ` · Attempts: ${joined}`
          }

          const line: RunLogEntry = {
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            nodeId: n.id,
            method,
            url,
            statusCode: r.statusCode ?? undefined,
            durationMs: r.durationMs,
            error: r.error ?? undefined,
            detail,
            attempts: r.attempts,
            outcome: r.outcome,
            errorDetail: r.errorDetail ?? undefined,
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
              lastAttempts: r.attempts,
              lastOutcome: r.outcome,
            },
          } as AppNode
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
        const p = persisted as PersistedV1 & Partial<WorkflowRootState> & {
          workflows?: Record<string, SavedWorkflow>
        }
        if (
          p.workflows &&
          p.activeWorkflowId &&
          p.workflows[p.activeWorkflowId]
        ) {
          const migrated: Record<string, SavedWorkflow> = {}
          for (const [k, w] of Object.entries(p.workflows)) {
            migrated[k] = migrateWorkflowRecord(w)
          }
          return {
            ...current,
            workflows: migrated,
            activeWorkflowId: p.activeWorkflowId,
            resultsOpen: p.resultsOpen ?? true,
            curlTargetNodeId: null,
            runInFlight: false,
            selectedNodeId: null,
            flowLoadNonce: 0,
          }
        }
        if (Array.isArray(p.nodes)) {
          const wf = newSavedWorkflow("Default")
          const migrated: SavedWorkflow = {
            ...wf,
            nodes: migrateSavedWorkflowNodes(p.nodes as unknown[]),
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
            selectedNodeId: null,
            flowLoadNonce: 0,
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
