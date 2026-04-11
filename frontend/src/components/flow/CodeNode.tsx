import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { Braces, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { runStatusPill } from "@/components/flow/runStatusUi"
import { flowHandleClass, flowNodeSurfaceClass } from "@/lib/flowNodeSurface"
import { cn } from "@/lib/utils"
import { useWorkflowStore } from "@/store/workflowStore"
import type { CodeNodeData } from "@/types/flow"

export function CodeNode({
  id,
  data,
  selected,
}: NodeProps<Node<CodeNodeData, "code">>) {
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const pill = runStatusPill(data)
  const line = data.code.split("\n").find((l) => l.trim()) ?? ""
  const short =
    line.length > 52 ? `${line.slice(0, 50)}…` : line || "(empty)"

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
        className={flowHandleClass}
      />
      <div className="flex min-w-0 flex-col gap-2 p-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <Badge
            variant="outline"
            className="min-w-0 shrink-0 border-indigo-400/35 bg-indigo-500/10 font-mono text-[10px] text-indigo-950 dark:border-indigo-400/40 dark:bg-indigo-500/15 dark:text-indigo-100"
          >
            <Braces className="mr-1 inline size-3" />
            {data.codeLanguage === "javascript" ? "JS" : "PY"}
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
          {data.codeLanguage === "javascript" ? "JavaScript" : "Python"} ·{" "}
          {data.timeoutS}s
        </p>
        <p
          className="min-w-0 break-all font-mono text-xs leading-snug text-foreground [overflow-wrap:anywhere]"
          title={data.code}
        >
          {short}
        </p>
        {(data.lastLatencyMs != null || data.runStatus === "running") && (
          <p className="text-[11px] text-muted-foreground">
            {data.runStatus === "running"
              ? "Running…"
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
