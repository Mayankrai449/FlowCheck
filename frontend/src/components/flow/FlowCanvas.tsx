import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useCallback, useMemo } from "react"
import {
  minimapNodeFill,
  minimapNodeStroke,
  minimapPanelBg,
} from "@/lib/minimapNodeStyle"
import { cn } from "@/lib/utils"
import { ApiNode } from "@/components/flow/ApiNode"
import { useTheme } from "@/components/theme/ThemeProvider"
import { selectActiveWorkflow, useWorkflowStore } from "@/store/workflowStore"
import type { AppNode } from "@/types/flow"

function FlowCanvasInner() {
  const { resolvedTheme } = useTheme()
  const nodes = useWorkflowStore((s) => selectActiveWorkflow(s)?.nodes ?? [])
  const edges = useWorkflowStore((s) => selectActiveWorkflow(s)?.edges ?? [])
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange)
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange)
  const onConnectStore = useWorkflowStore((s) => s.onConnect)

  const nodeTypes = useMemo(() => ({ api: ApiNode }), [])

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

  const theme = resolvedTheme === "dark" ? "dark" : "light"

  const miniMapNodeColor = useCallback(
    (node: Node) => minimapNodeFill(node, theme),
    [theme],
  )

  const miniMapStrokeColor = useCallback(
    () => minimapNodeStroke(theme),
    [theme],
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={handleNodesChange}
      onEdgesChange={handleEdgesChange}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      deleteKeyCode={["Backspace", "Delete"]}
      proOptions={{ hideAttribution: true }}
      className={cn(
        "bg-background",
        resolvedTheme === "dark" && "dark",
      )}
    >
      <Background gap={20} size={1} color="var(--border)" />
      <Controls className="overflow-hidden rounded-md border border-border shadow-sm" />
      <MiniMap
        className="!border-border !shadow-sm"
        bgColor={minimapPanelBg(theme)}
        maskColor={
          resolvedTheme === "dark"
            ? "rgb(0 0 0 / 50%)"
            : "rgb(0 0 0 / 6%)"
        }
        nodeStrokeWidth={2}
        nodeColor={miniMapNodeColor}
        nodeStrokeColor={miniMapStrokeColor}
      />
    </ReactFlow>
  )
}

export function FlowCanvas() {
  const activeWorkflowId = useWorkflowStore((s) => s.activeWorkflowId)
  return (
    <ReactFlowProvider key={activeWorkflowId}>
      <div className="h-full min-h-0 w-full min-w-0 rounded-lg border border-border bg-card shadow-sm">
        <FlowCanvasInner />
      </div>
    </ReactFlowProvider>
  )
}
