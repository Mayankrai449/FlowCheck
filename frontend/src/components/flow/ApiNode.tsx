import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Code2, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useWorkflowStore } from "@/store/workflowStore"
import type { ApiNodeData, AppNode } from "@/types/flow"

function methodBadgeClass(method: string): string {
  const m = method.toUpperCase()
  if (m === "GET") return "bg-sky-100 text-sky-800 border-sky-200"
  if (m === "POST") return "bg-emerald-100 text-emerald-800 border-emerald-200"
  if (m === "PUT" || m === "PATCH")
    return "bg-amber-100 text-amber-900 border-amber-200"
  if (m === "DELETE") return "bg-rose-100 text-rose-800 border-rose-200"
  return "bg-muted text-muted-foreground border-border"
}

function statusPill(data: ApiNodeData): { label: string; className: string } {
  switch (data.runStatus) {
    case "running":
      return {
        label: "Running",
        className:
          "bg-blue-50 text-blue-700 border-blue-200 animate-pulse",
      }
    case "success":
      return {
        label:
          data.lastStatusCode != null
            ? `Success · ${data.lastStatusCode}`
            : "Success",
        className: "bg-emerald-50 text-emerald-800 border-emerald-200",
      }
    case "fail":
      return {
        label: data.lastStatusCode != null ? `Fail · ${data.lastStatusCode}` : "Fail",
        className: "bg-red-50 text-red-800 border-red-200",
      }
    default:
      return {
        label: "Idle",
        className: "bg-muted/80 text-muted-foreground border-border",
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
        "w-[280px] rounded-lg border border-border bg-card shadow-sm transition-shadow",
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
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <Badge
            variant="outline"
            className={cn("shrink-0 font-mono text-[10px]", methodBadgeClass(data.method))}
          >
            {data.method.toUpperCase()}
          </Badge>
          <div className="flex shrink-0 items-center gap-1">
            <span
              className={cn(
                "inline-flex max-w-[100px] items-center rounded-md border px-2 py-0.5 text-[10px] font-medium",
                pill.className,
              )}
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
          className="break-all text-left font-mono text-xs leading-snug text-foreground"
          title={data.url}
        >
          {shortUrl}
        </p>
        {(data.lastLatencyMs != null || data.runStatus === "running") && (
          <p className="text-[11px] text-muted-foreground">
            {data.runStatus === "running"
              ? "Executing…"
              : `Latency · ${data.lastLatencyMs?.toFixed(1)} ms`}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="h-7 w-full gap-1 text-xs"
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
