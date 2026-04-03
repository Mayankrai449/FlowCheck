import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useCallback, useMemo } from "react"
import { ApiNode } from "@/components/flow/ApiNode"
import { useWorkflowStore } from "@/store/workflowStore"
import type { AppNode } from "@/types/flow"

function FlowCanvasInner() {
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
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
      className="bg-background"
    >
      <Background gap={20} size={1} color="var(--border)" />
      <Controls className="!border-border !bg-card !shadow-sm" />
      <MiniMap
        className="!border-border !bg-card !shadow-sm"
        maskColor="rgb(0 0 0 / 6%)"
      />
    </ReactFlow>
  )
}

export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <div className="h-full w-full min-h-0 rounded-lg border border-border bg-card shadow-sm">
        <FlowCanvasInner />
      </div>
    </ReactFlowProvider>
  )
}
