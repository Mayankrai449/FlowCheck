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

  const showButton = hovered || selected

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
      {showButton && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="fc-edge-delete-btn"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            onClick={onDelete}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            title="Delete connection"
          >
            <Trash2 className="size-3.5" />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
