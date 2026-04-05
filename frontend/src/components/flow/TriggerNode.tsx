import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { Trash2, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { runStatusPill } from "@/components/flow/runStatusUi"
import { flowHandleClass, flowNodeSurfaceClass } from "@/lib/flowNodeSurface"
import { cn } from "@/lib/utils"
import { useWorkflowStore } from "@/store/workflowStore"
import type { TriggerNodeData } from "@/types/flow"

export function TriggerNode({
  id,
  data,
  selected,
}: NodeProps<Node<TriggerNodeData, "trigger">>) {
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const pill = runStatusPill(data)
  const note = data.note?.trim()

  return (
    <div
      className={flowNodeSurfaceClass({
        selected,
        runStatus: data.runStatus,
        widthClass: "w-[260px]",
        maxPx: 260,
      })}
    >
      <div className="flex min-w-0 flex-col gap-2 p-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <Badge
            variant="outline"
            className="min-w-0 shrink-0 border-amber-400/40 bg-amber-500/12 font-mono text-[10px] text-amber-950 dark:border-amber-400/45 dark:bg-amber-500/18 dark:text-amber-100"
          >
            <Zap className="mr-1 inline size-3" />
            START
          </Badge>
          <div className="flex min-w-0 shrink items-center justify-end gap-1">
            <span
              className={cn(
                "inline-flex min-w-0 max-w-[7.5rem] items-center truncate rounded-md border px-2 py-0.5 text-[10px] font-medium",
                pill.className,
              )}
              title={pill.label}
            >
              {pill.label}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-7 text-muted-foreground hover:text-destructive"
              title="Remove block"
              onClick={(e) => {
                e.stopPropagation()
                removeNode(id)
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
        <p className="text-sm font-medium leading-snug text-foreground">
          {data.label}
        </p>
        {note ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {note.length > 140 ? `${note.slice(0, 138)}…` : note}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Entry point for the graph.
          </p>
        )}
        {(data.lastLatencyMs != null || data.runStatus === "running") && (
          <p className="text-[11px] text-muted-foreground">
            {data.runStatus === "running" ? "…" : `${data.lastLatencyMs?.toFixed(1)} ms`}
          </p>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className={flowHandleClass}
      />
    </div>
  )
}
