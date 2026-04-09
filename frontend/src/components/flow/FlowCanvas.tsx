import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type OnSelectionChangeFunc,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useCallback, useEffect, useMemo, useRef, type DragEvent } from "react"
import { toast } from "sonner"
import {
  LayoutGrid,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { CodeNode } from "@/components/flow/CodeNode"
import { ConditionNode } from "@/components/flow/ConditionNode"
import { DeletableEdge } from "@/components/flow/DeletableEdge"
import { HttpNode } from "@/components/flow/HttpNode"
import { TriggerNode } from "@/components/flow/TriggerNode"
import { Button } from "@/components/ui/button"
import {
  minimapNodeFill,
  minimapNodeStroke,
  minimapPanelBg,
} from "@/lib/minimapNodeStyle"
import { cn } from "@/lib/utils"
import { useTheme } from "@/components/theme/ThemeProvider"
import {
  selectActiveWorkflow,
  useWorkflowStore,
} from "@/store/workflowStore"
import type { AppNode, FlowNodeKind } from "@/types/flow"
import { FLOW_NODE_KINDS } from "@/types/flow"

function FlowCanvasInner() {
  const { resolvedTheme } = useTheme()
  const {
    screenToFlowPosition,
    setViewport,
    fitView,
    zoomIn,
    zoomOut,
  } = useReactFlow()
  const activeWorkflowId = useWorkflowStore((s) => s.activeWorkflowId)
  const flowLoadNonce = useWorkflowStore((s) => s.flowLoadNonce)
  const runInFlight = useWorkflowStore((s) => s.runInFlight)
  const setWorkflowViewport = useWorkflowStore((s) => s.setWorkflowViewport)
  const applyAutoLayout = useWorkflowStore((s) => s.applyAutoLayout)
  const nodes = useWorkflowStore((s) => selectActiveWorkflow(s)?.nodes ?? [])
  const edges = useWorkflowStore((s) => selectActiveWorkflow(s)?.edges ?? [])
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange)
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange)
  const onConnectStore = useWorkflowStore((s) => s.onConnect)
  const addNodeAt = useWorkflowStore((s) => s.addNodeAt)
  const setSelectedNodeId = useWorkflowStore((s) => s.setSelectedNodeId)

  const syncRef = useRef<{ wid: string | null; nonce: number }>({
    wid: null,
    nonce: -1,
  })
  useEffect(() => {
    const first = syncRef.current.wid === null
    const wfChanged = syncRef.current.wid !== activeWorkflowId
    const loadBump = syncRef.current.nonce !== flowLoadNonce
    syncRef.current = { wid: activeWorkflowId, nonce: flowLoadNonce }
    if (!first && !wfChanged && !loadBump) return

    const wf = useWorkflowStore.getState().workflows[activeWorkflowId]
    const vp = wf?.viewport
    const id = requestAnimationFrame(() => {
      if (vp) {
        setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom }, { duration: 0 })
      } else {
        fitView({ padding: 0.2 })
      }
    })
    return () => cancelAnimationFrame(id)
  }, [activeWorkflowId, flowLoadNonce, setViewport, fitView])

  const nodeTypes = useMemo(
    () => ({
      http: HttpNode,
      condition: ConditionNode,
      code: CodeNode,
      trigger: TriggerNode,
    }),
    [],
  )

  const edgeTypes = useMemo(
    () => ({
      deletable: DeletableEdge,
    }),
    [],
  )

  const defaultEdgeOptions = useMemo(
    () => ({
      type: "deletable" as const,
      animated: runInFlight,
      style: {
        strokeWidth: runInFlight ? 2.25 : 1.75,
      },
    }),
    [runInFlight],
  )

  const handleNodesChange: OnNodesChange<AppNode> = useCallback(
    (chs) => {
      onNodesChange(chs)
    },
    [onNodesChange],
  )

  const handleEdgesChange: OnEdgesChange = useCallback(
    (chs) => {
      onEdgesChange(chs)
    },
    [onEdgesChange],
  )

  const onConnect: OnConnect = useCallback(
    (c) => {
      onConnectStore(c)
    },
    [onConnectStore],
  )

  const onSelectionChange: OnSelectionChangeFunc<AppNode, Edge> = useCallback(
    ({ nodes: sel }) => {
      setSelectedNodeId(sel.length === 1 ? sel[0]!.id : null)
    },
    [setSelectedNodeId],
  )

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData("application/reactflow")
      if (!raw || !(FLOW_NODE_KINDS as readonly string[]).includes(raw)) return
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addNodeAt(raw as FlowNodeKind, pos)
    },
    [addNodeAt, screenToFlowPosition],
  )

  const theme = resolvedTheme === "dark" ? "dark" : "light"

  const miniMapNodeColor = useCallback(
    (node: Node) => minimapNodeFill(node, theme),
    [theme],
  )

  const miniMapStrokeColor = useCallback(
    () => minimapNodeStroke(theme),
    [theme],
  )

  const onAutoLayout = useCallback(() => {
    const r = applyAutoLayout()
    if (r.ok) {
      toast.success("Layout arranged by execution waves")
    } else {
      toast.error(r.message)
    }
  }, [applyAutoLayout])

  return (
    <div
      className="h-full min-h-[420px] w-full min-w-0"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onMoveEnd={(_, vp) => {
          setWorkflowViewport({ x: vp.x, y: vp.y, zoom: vp.zoom })
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
        minZoom={0.08}
        maxZoom={1.85}
        className={cn(
          "h-full min-h-0 w-full min-w-0 bg-transparent",
          resolvedTheme === "dark" && "dark",
        )}
      >
        <Background
          id="fc-grid"
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.15}
          color={
            resolvedTheme === "dark"
              ? "color-mix(in oklab, var(--foreground) 14%, transparent)"
              : "color-mix(in oklab, var(--foreground) 12%, transparent)"
          }
        />
        <Panel
          position="bottom-left"
          className="m-3 flex flex-col gap-1.5"
        >
          <div
            className={cn(
              "flex flex-col gap-0.5 rounded-xl border p-1 shadow-xl",
              "border-white/10 bg-slate-950/55 backdrop-blur-xl",
              "dark:border-white/[0.08] dark:bg-slate-950/50",
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-lg text-foreground/90 hover:bg-white/10"
              title="Zoom in"
              onClick={() => zoomIn({ duration: 220 })}
            >
              <ZoomIn className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-lg text-foreground/90 hover:bg-white/10"
              title="Zoom out"
              onClick={() => zoomOut({ duration: 220 })}
            >
              <ZoomOut className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-lg text-foreground/90 hover:bg-white/10"
              title="Fit view"
              onClick={() => fitView({ padding: 0.22, duration: 280 })}
            >
              <Maximize2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-lg text-foreground/90 hover:bg-white/10"
              title="Auto-layout by execution order"
              onClick={onAutoLayout}
            >
              <LayoutGrid className="size-4" />
            </Button>
          </div>
        </Panel>
        <MiniMap
          className={cn(
            "!overflow-hidden !rounded-2xl !border !shadow-2xl !backdrop-blur-md",
            "!border-white/10 !bg-slate-950/45 dark:!border-white/[0.08]",
          )}
          pannable
          zoomable
          bgColor={minimapPanelBg(theme)}
          maskColor={
            resolvedTheme === "dark"
              ? "rgb(0 0 0 / 58%)"
              : "rgb(0 0 0 / 7%)"
          }
          nodeStrokeWidth={2}
          nodeColor={miniMapNodeColor}
          nodeStrokeColor={miniMapStrokeColor}
        />
      </ReactFlow>
    </div>
  )
}

export function FlowCanvas() {
  const activeWorkflowId = useWorkflowStore((s) => s.activeWorkflowId)
  return (
    <ReactFlowProvider key={activeWorkflowId}>
      <div
        className={cn(
          "fc-flow-canvas-host relative h-full min-h-0 w-full min-w-0 overflow-hidden rounded-2xl border shadow-inner",
          "border-white/10 bg-background/80 backdrop-blur-sm dark:border-white/[0.07]",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 90% 55% at 50% 0%, color-mix(in oklab, var(--fc-accent, oklch(0.6 0.2 278)) 18%, transparent), transparent 65%)",
          }}
          aria-hidden
        />
        <div className="relative z-[1] h-full min-h-0">
          <FlowCanvasInner />
        </div>
      </div>
    </ReactFlowProvider>
  )
}
