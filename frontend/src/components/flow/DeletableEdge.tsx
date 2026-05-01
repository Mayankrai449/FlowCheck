import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react"
import { Trash2 } from "lucide-react"
import { useState, useCallback } from "react"
import { useWorkflowStore } from "@/store/workflowStore"

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false)
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange)

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const onDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onEdgesChange([{ id, type: "remove" }])
    },
    [id, onEdgesChange],
  )

  const visible = hovered || selected

  return (
    <>
      {/* Invisible wider path for easier hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: "pointer" }}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerEnd}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          className="fc-edge-delete-btn"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: visible ? "all" : "none",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.2s ease",
          }}
          onClick={onDelete}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          title="Delete connection"
          aria-hidden={!visible}
          tabIndex={visible ? 0 : -1}
        >
          <Trash2 className="size-3.5" />
        </button>
      </EdgeLabelRenderer>
    </>
  )
}
