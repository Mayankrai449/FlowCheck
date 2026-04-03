import {
  ChevronDown,
  ChevronUp,
  LayoutPanelLeft,
  Play,
  ScrollText,
} from "lucide-react"
import { useCallback } from "react"
import { toast } from "sonner"
import { CurlImportDialog } from "@/components/curl/CurlImportDialog"
import { FlowCanvas } from "@/components/flow/FlowCanvas"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { executeFlowApi } from "@/lib/executeFlow"
import { cn } from "@/lib/utils"
import { useWorkflowStore } from "@/store/workflowStore"

export function AppShell() {
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const addApiNodeBase = useWorkflowStore((s) => s.addApiNode)
  const resultsOpen = useWorkflowStore((s) => s.resultsOpen)
  const setResultsOpen = useWorkflowStore((s) => s.setResultsOpen)
  const lastRunLogs = useWorkflowStore((s) => s.lastRunLogs)
  const runInFlight = useWorkflowStore((s) => s.runInFlight)
  const setRunInFlight = useWorkflowStore((s) => s.setRunInFlight)
  const resetGraphRunUi = useWorkflowStore((s) => s.resetGraphRunUi)
  const abortRunUi = useWorkflowStore((s) => s.abortRunUi)
  const applyExecutionResults = useWorkflowStore((s) => s.applyExecutionResults)

  const addApiNode = useCallback(() => {
    addApiNodeBase()
    toast.success("API block added")
  }, [addApiNodeBase])

  const onRun = async () => {
    if (!nodes.length) {
      toast.error("Add at least one API block to run the workflow.")
      return
    }
    resetGraphRunUi()
    setRunInFlight(true)
    setResultsOpen(true)
    try {
      const { results } = await executeFlowApi(nodes, edges)
      applyExecutionResults(results)
      toast.success("Workflow finished")
    } catch (e) {
      abortRunUi()
      toast.error(e instanceof Error ? e.message : "Run failed")
    } finally {
      setRunInFlight(false)
    }
  }

  const onScriptChoice = (kind: "python" | "node") => {
    toast.info(`${kind === "python" ? "Python" : "Node.js"} export is coming soon.`)
  }

  const bottomHeight = resultsOpen ? "min-h-[280px] max-h-[40vh]" : "min-h-0"

  return (
    <div className="flex h-svh max-h-svh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex min-w-0 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-background shadow-sm">
            <LayoutPanelLeft className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              FlowCheck
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              Workflow sandbox simulator
            </p>
          </div>
        </div>
        <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "cursor-pointer gap-1",
              )}
            >
              Generate script
              <ChevronDown className="size-3.5 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onScriptChoice("python")}>
                Python
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onScriptChoice("node")}>
                Node.js
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={runInFlight || !nodes.length}
            onClick={() => void onRun()}
          >
            <Play className="size-3.5" />
            {runInFlight ? "Running…" : "Run workflow"}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex w-full min-w-0 shrink-0 flex-col overflow-x-hidden border-b border-border bg-sidebar md:w-[260px] md:max-w-[260px] md:border-r md:border-b-0">
          <div className="space-y-1 border-b border-border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Available blocks
            </p>
            <p className="text-xs leading-relaxed break-words text-muted-foreground">
              Drag on canvas, connect top-to-bottom for order. Fork one block to
              run requests in parallel.
            </p>
          </div>
          <div className="min-w-0 p-4">
            <Button
              type="button"
              variant="outline"
              className="h-auto w-full max-w-full flex-col items-start gap-1 border-dashed py-3 text-left whitespace-normal shadow-none"
              onClick={addApiNode}
            >
              <span className="w-full min-w-0 text-sm font-medium break-words">
                + API block
              </span>
              <span className="w-full min-w-0 text-left text-[11px] font-normal break-words text-muted-foreground">
                Paste cURL on the node to configure the request.
              </span>
            </Button>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 p-3">
          <div className="flex min-h-0 flex-1 flex-col">
            <FlowCanvas />
          </div>

          <div
            className={cn(
              "mt-3 flex shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all",
              bottomHeight,
            )}
          >
            <button
              type="button"
              className="flex min-w-0 w-full cursor-pointer items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-left hover:bg-muted/40"
              onClick={() => setResultsOpen(!resultsOpen)}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
                <ScrollText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate">Results</span>
                {lastRunLogs.length ? (
                  <Badge
                    variant="secondary"
                    className="shrink-0 font-mono text-[10px]"
                  >
                    {lastRunLogs.length}
                  </Badge>
                ) : null}
              </span>
              {resultsOpen ? (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
              )}
            </button>
            {resultsOpen ? (
              <>
                <Separator />
                <ScrollArea className="h-full min-h-[200px] min-w-0 flex-1 px-2">
                  <ul className="min-w-0 space-y-2 py-3 pr-2">
                    {lastRunLogs.length === 0 ? (
                      <li className="px-2 text-sm break-words text-muted-foreground">
                        Run a workflow to see per-node latency, status codes,
                        and timing here.
                      </li>
                    ) : (
                      lastRunLogs.map((log) => (
                        <li
                          key={log.id}
                          className="min-w-0 overflow-hidden rounded-md border border-border bg-background px-3 py-2 text-xs shadow-sm"
                        >
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] text-muted-foreground">
                            <span className="shrink-0">
                              {new Date(log.at).toLocaleTimeString()}
                            </span>
                            <span className="shrink-0 rounded bg-muted px-1 py-px">
                              {log.nodeId.slice(0, 8)}
                            </span>
                            <span className="min-w-0 max-w-full font-semibold break-all text-foreground">
                              {log.method}
                            </span>
                            {log.statusCode != null ? (
                              <span className="shrink-0">{log.statusCode}</span>
                            ) : null}
                            {log.durationMs != null ? (
                              <span className="shrink-0">
                                {log.durationMs.toFixed(1)} ms
                              </span>
                            ) : null}
                          </div>
                          <p
                            className="mt-1 break-all font-mono text-[11px] text-foreground [overflow-wrap:anywhere]"
                            title={log.url}
                          >
                            {log.url}
                          </p>
                          <p className="mt-1 text-[11px] break-words whitespace-pre-wrap text-muted-foreground">
                            {log.detail}
                          </p>
                          {log.error ? (
                            <p className="mt-1 text-[11px] break-words whitespace-pre-wrap text-destructive">
                              {log.error}
                            </p>
                          ) : null}
                        </li>
                      ))
                    )}
                  </ul>
                </ScrollArea>
              </>
            ) : null}
          </div>
        </main>
      </div>

      <CurlImportDialog />
    </div>
  )
}
