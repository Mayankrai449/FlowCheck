import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { GitBranch, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { runStatusPill } from "@/components/flow/runStatusUi"
import { flowHandleClass, flowNodeSurfaceClass } from "@/lib/flowNodeSurface"
import { cn } from "@/lib/utils"
import { useWorkflowStore } from "@/store/workflowStore"
import type { ConditionNodeData } from "@/types/flow"

export function ConditionNode({
  id,
  data,
  selected,
}: NodeProps<Node<ConditionNodeData, "condition">>) {
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const pill = runStatusPill(data)
  const short =
    data.expression.length > 52
      ? `${data.expression.slice(0, 50)}…`
      : data.expression

  return (
    <div
      className={flowNodeSurfaceClass({
        selected,
        runStatus: data.runStatus,
      })}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2.5 !border-border !bg-background"
      />
      <div className="flex min-w-0 flex-col gap-2 p-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <Badge
            variant="outline"
            className="min-w-0 shrink-0 border-violet-400/35 bg-violet-500/12 font-mono text-[10px] text-violet-950 dark:border-violet-400/45 dark:bg-violet-500/18 dark:text-violet-100"
          >
            <GitBranch className="mr-1 inline size-3" />
            IF
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
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Condition · {data.evalMode === "python_sandbox" ? "Python" : "Expression"}
        </p>
        <p
          className="min-w-0 break-all font-mono text-xs leading-snug text-foreground [overflow-wrap:anywhere]"
          title={data.expression}
        >
          {short || "—"}
        </p>
        {(data.lastLatencyMs != null || data.runStatus === "running") && (
          <p className="text-[11px] text-muted-foreground">
            {data.runStatus === "running"
              ? "Evaluating…"
              : `${data.lastLatencyMs?.toFixed(1)} ms`}
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
