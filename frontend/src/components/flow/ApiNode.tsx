import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Code2, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useWorkflowStore } from "@/store/workflowStore"
import type { ApiNodeData, AppNode } from "@/types/flow"

function methodBadgeClass(method: string): string {
  const m = method.toUpperCase()
  if (m === "GET")
    return "border-sky-400/35 bg-sky-500/15 text-sky-900 dark:border-sky-400/45 dark:bg-sky-400/20 dark:text-sky-100"
  if (m === "POST")
    return "border-emerald-400/35 bg-emerald-500/15 text-emerald-900 dark:border-emerald-400/45 dark:bg-emerald-400/20 dark:text-emerald-100"
  if (m === "PUT" || m === "PATCH")
    return "border-amber-400/40 bg-amber-500/15 text-amber-950 dark:border-amber-400/45 dark:bg-amber-400/18 dark:text-amber-100"
  if (m === "DELETE")
    return "border-rose-400/35 bg-rose-500/15 text-rose-900 dark:border-rose-400/45 dark:bg-rose-400/20 dark:text-rose-100"
  return "bg-muted text-muted-foreground border-border"
}

function statusPill(data: ApiNodeData): { label: string; className: string } {
  switch (data.runStatus) {
    case "running":
      return {
        label: "Running",
        className:
          "border-blue-400/40 bg-blue-500/15 text-blue-900 animate-pulse dark:border-blue-400/50 dark:bg-blue-500/25 dark:text-blue-100",
      }
    case "success":
      return {
        label:
          data.lastStatusCode != null
            ? `Success · ${data.lastStatusCode}`
            : "Success",
        className:
          "border-emerald-400/40 bg-emerald-500/15 text-emerald-900 dark:border-emerald-400/50 dark:bg-emerald-400/22 dark:text-emerald-100",
      }
    case "fail":
      return {
        label: data.lastStatusCode != null ? `Fail · ${data.lastStatusCode}` : "Fail",
        className:
          "border-red-400/40 bg-red-500/15 text-red-900 dark:border-red-400/50 dark:bg-red-500/25 dark:text-red-100",
      }
    default:
      return {
        label: "Idle",
        className:
          "border-border bg-muted text-muted-foreground dark:bg-muted/60 dark:text-foreground/85",
      }
  }
}

export function ApiNode({ id, data, selected }: NodeProps<AppNode>) {
  const setCurlTarget = useWorkflowStore((s) => s.setCurlTarget)
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const pill = statusPill(data)
  const shortUrl =
    data.url.length > 46 ? `${data.url.slice(0, 44)}…` : data.url

  return (
    <div
      className={cn(
        "w-[280px] max-w-[min(280px,100%)] min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow",
        selected && "ring-2 ring-ring/40 shadow-md",
      )}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setCurlTarget(id)
      }}
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
            className={cn(
              "min-w-0 max-w-[45%] shrink truncate font-mono text-[10px]",
              methodBadgeClass(data.method),
            )}
            title={data.method.toUpperCase()}
          >
            {data.method.toUpperCase()}
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
        <p
          className="min-w-0 break-all text-left font-mono text-xs leading-snug text-foreground [overflow-wrap:anywhere]"
          title={data.url}
        >
          {shortUrl}
        </p>
        {(data.lastLatencyMs != null || data.runStatus === "running") && (
          <p className="min-w-0 break-words text-[11px] text-muted-foreground">
            {data.runStatus === "running"
              ? "Executing…"
              : `Latency · ${data.lastLatencyMs?.toFixed(1)} ms`}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="h-auto min-h-7 w-full flex-wrap gap-1 whitespace-normal text-xs"
          onClick={(e) => {
            e.stopPropagation()
            setCurlTarget(id)
          }}
        >
          <Code2 className="size-3.5" />
          Import cURL
        </Button>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-2.5 !border-border !bg-background"
      />
    </div>
  )
}
