import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Copy,
  LayoutPanelLeft,
  Moon,
  Pencil,
  Play,
  Plus,
  ScrollText,
  Sun,
  Trash2,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import { PerformanceDashboard } from "@/components/dashboard/PerformanceDashboard"
import { CurlImportDialog } from "@/components/curl/CurlImportDialog"
import { FlowCanvas } from "@/components/flow/FlowCanvas"
import { useTheme } from "@/components/theme/ThemeProvider"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { downloadTextFile } from "@/lib/downloadTextFile"
import { executeFlowApi, type ExecuteFlowResult } from "@/lib/executeFlow"
import {
  buildExecutionPlan,
  slugifyFilename,
} from "@/lib/executionPlan"
import { generateNodeScript } from "@/lib/generateNodeScript"
import { generatePythonScript } from "@/lib/generatePythonScript"
import { buildStressSummary } from "@/lib/stressStats"
import { cn } from "@/lib/utils"
import {
  selectActiveWorkflow,
  useWorkflowStore,
} from "@/store/workflowStore"

export function AppShell() {
  const { resolvedTheme, toggleTheme } = useTheme()
  const workflows = useWorkflowStore((s) => s.workflows)
  const activeWorkflowId = useWorkflowStore((s) => s.activeWorkflowId)
  const activeWf = useWorkflowStore(selectActiveWorkflow)
  const nodes = activeWf?.nodes ?? []
  const edges = activeWf?.edges ?? []
  const addApiNodeBase = useWorkflowStore((s) => s.addApiNode)
  const createWorkflow = useWorkflowStore((s) => s.createWorkflow)
  const setActiveWorkflow = useWorkflowStore((s) => s.setActiveWorkflow)
  const renameWorkflow = useWorkflowStore((s) => s.renameWorkflow)
  const duplicateWorkflow = useWorkflowStore((s) => s.duplicateWorkflow)
  const deleteWorkflow = useWorkflowStore((s) => s.deleteWorkflow)
  const appendStressSummary = useWorkflowStore((s) => s.appendStressSummary)
  const resultsOpen = useWorkflowStore((s) => s.resultsOpen)
  const setResultsOpen = useWorkflowStore((s) => s.setResultsOpen)
  const lastRunLogs = activeWf?.lastRunLogs ?? []
  const runInFlight = useWorkflowStore((s) => s.runInFlight)
  const setRunInFlight = useWorkflowStore((s) => s.setRunInFlight)
  const resetGraphRunUi = useWorkflowStore((s) => s.resetGraphRunUi)
  const abortRunUi = useWorkflowStore((s) => s.abortRunUi)
  const applyExecutionResults = useWorkflowStore((s) => s.applyExecutionResults)

  const [stressIterations, setStressIterations] = useState(5)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState("")

  const workflowList = useMemo(
    () =>
      Object.values(workflows).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    [workflows],
  )

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

  const onStressRun = async () => {
    if (!nodes.length) {
      toast.error("Add at least one API block to stress test.")
      return
    }
    const n = Math.min(100, Math.max(1, Math.floor(stressIterations)))
    const rounds: ExecuteFlowResult[][] = []
    setRunInFlight(true)
    setResultsOpen(true)
    try {
      for (let i = 0; i < n; i++) {
        resetGraphRunUi()
        const { results } = await executeFlowApi(nodes, edges)
        rounds.push(results)
      }
      const summary = buildStressSummary(n, rounds, nodes)
      appendStressSummary(summary)
      const last = rounds[rounds.length - 1]!
      applyExecutionResults(last)
      toast.success(`Stress run finished (${n}×)`)
    } catch (e) {
      abortRunUi()
      toast.error(e instanceof Error ? e.message : "Stress run failed")
    } finally {
      setRunInFlight(false)
    }
  }

  const exportScript = useCallback(
    (kind: "python" | "node") => {
      if (!nodes.length) {
        toast.error("Add at least one API block to export a script.")
        return
      }
      const plan = buildExecutionPlan(nodes, edges)
      if (!plan.ok) {
        toast.error(plan.message)
        return
      }
      const slug = slugifyFilename(activeWf?.name ?? "workflow")
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
      try {
        if (kind === "python") {
          const src = generatePythonScript(nodes, plan.batches)
          downloadTextFile(src, `flowcheck-${slug}-${stamp}.py`, "text/x-python")
          toast.success("Python script downloaded")
        } else {
          const src = generateNodeScript(nodes, plan.batches)
          downloadTextFile(
            src,
            `flowcheck-${slug}-${stamp}.mjs`,
            "text/javascript",
          )
          toast.success("Node script downloaded")
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Export failed")
      }
    },
    [nodes, edges, activeWf?.name],
  )

  const openNewWorkflow = () => {
    setNewName(`Workflow ${Object.keys(workflows).length + 1}`)
    setNewDialogOpen(true)
  }

  const submitNewWorkflow = () => {
    createWorkflow(newName)
    setNewDialogOpen(false)
    toast.success("Workflow created")
  }

  const openRename = (id: string, current: string) => {
    setRenameId(id)
    setRenameName(current)
  }

  const submitRename = () => {
    if (renameId) {
      renameWorkflow(renameId, renameName)
      toast.success("Renamed workflow")
    }
    setRenameId(null)
  }

  const onDeleteWorkflow = (id: string, name: string) => {
    if (!window.confirm(`Delete workflow “${name}”? This cannot be undone.`)) {
      return
    }
    const ok = deleteWorkflow(id)
    if (!ok) {
      toast.error("Keep at least one workflow.")
      return
    }
    toast.success("Workflow deleted")
  }

  const bottomHeight = resultsOpen ? "min-h-[280px] max-h-[40vh]" : "min-h-0"

  return (
    <div className="flex h-svh max-h-svh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 min-w-0 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 shadow-sm">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="shrink-0"
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            onClick={() => setSidebarOpen((o) => !o)}
          >
            <LayoutPanelLeft className="size-4" />
          </Button>
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
          <Sheet>
            <SheetTrigger
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "cursor-pointer gap-1.5",
              )}
            >
              <BarChart3 className="size-3.5" />
              <span className="hidden sm:inline">Dashboard</span>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 border-l border-border p-0 sm:max-w-lg"
            >
              <SheetHeader className="shrink-0 space-y-1.5 border-b border-border px-4 py-4 pr-14 text-left">
                <SheetTitle className="text-lg">Performance</SheetTitle>
                <SheetDescription className="text-pretty">
                  Charts use data from runs and stress tests on the{" "}
                  <strong className="font-medium text-foreground">active</strong>{" "}
                  workflow only.
                </SheetDescription>
              </SheetHeader>
              <ScrollArea className="min-h-0 w-full flex-1 [&_[data-slot=scroll-area-viewport]]:max-h-[calc(100dvh-8.5rem)]">
                <div className="px-4 py-4">
                  <PerformanceDashboard />
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="shrink-0"
            onClick={toggleTheme}
            aria-label={
              resolvedTheme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme"
            }
            title={
              resolvedTheme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme"
            }
          >
            {resolvedTheme === "dark" ? (
              <Sun className="size-3.5" />
            ) : (
              <Moon className="size-3.5" />
            )}
          </Button>
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
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => exportScript("python")}>
                Download Python (.py)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportScript("node")}>
                Download Node (.mjs)
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

      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close sidebar"
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
        <aside
          id="app-sidebar"
          className={cn(
            "flex min-h-0 w-full max-w-[280px] flex-col overflow-x-hidden overflow-y-auto border-border bg-sidebar transition-[transform,width,opacity] duration-200 ease-out",
            "fixed bottom-0 left-0 top-14 z-40 border-b border-r shadow-xl md:static md:top-auto md:z-auto md:max-w-none md:border-b-0 md:shadow-none",
            "md:w-[280px] md:max-w-[280px] md:shrink-0 md:border-r",
            sidebarOpen
              ? "translate-x-0"
              : "-translate-x-full md:translate-x-0 md:w-0 md:max-w-0 md:overflow-hidden md:border-0 md:opacity-0 md:shadow-none md:pointer-events-none",
          )}
        >
          <div className="space-y-2 border-b border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Workflows
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-foreground/85 hover:bg-muted hover:text-foreground dark:text-foreground/90"
                title="New workflow"
                onClick={openNewWorkflow}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
            <ScrollArea className="max-h-[140px] min-w-0">
              <ul className="flex min-w-0 flex-col gap-1 pr-2">
                {workflowList.map((w) => (
                  <li key={w.id} className="min-w-0">
                    <div
                      className={cn(
                        "flex min-w-0 items-center gap-1 rounded-md border px-1.5 py-1",
                        w.id === activeWorkflowId
                          ? "border-primary/50 bg-primary/10 dark:bg-primary/15"
                          : "border-border/60 bg-card/90 hover:bg-muted/80 dark:border-border dark:bg-muted/40 dark:hover:bg-muted/60",
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-xs font-medium text-foreground"
                        onClick={() => setActiveWorkflow(w.id)}
                      >
                        {w.name}
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="text-foreground/80 hover:bg-muted hover:text-foreground dark:text-foreground/90"
                          title="Rename"
                          onClick={() => openRename(w.id, w.name)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="text-foreground/80 hover:bg-muted hover:text-foreground dark:text-foreground/90"
                          title="Duplicate"
                          onClick={() => {
                            duplicateWorkflow(w.id)
                            toast.success("Workflow duplicated")
                          }}
                        >
                          <Copy className="size-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title="Delete"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:text-red-400 dark:hover:bg-destructive/20"
                          onClick={() => onDeleteWorkflow(w.id, w.name)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>

          <div className="space-y-2 border-b border-border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Stress test
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Runs the workflow sequentially N times and records aggregates (stored
              in the browser).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={1}
                max={100}
                className="h-8 w-16"
                value={stressIterations}
                onChange={(e) =>
                  setStressIterations(Number(e.target.value) || 1)
                }
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="border border-border bg-secondary text-secondary-foreground shadow-sm dark:border-border dark:bg-muted dark:text-foreground"
                disabled={runInFlight || !nodes.length}
                onClick={() => void onStressRun()}
              >
                Run N×
              </Button>
            </div>
          </div>

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
              className="h-auto w-full max-w-full flex-col items-start gap-1 border-dashed border-border/80 bg-card py-3 text-left whitespace-normal shadow-sm dark:border-border dark:bg-card/60 dark:hover:bg-muted/50"
              onClick={addApiNode}
            >
              <span className="w-full min-w-0 text-sm font-medium break-words text-foreground">
                + API block
              </span>
              <span className="w-full min-w-0 text-left text-[11px] font-normal break-words text-muted-foreground dark:text-muted-foreground">
                Paste cURL on the node to configure the request.
              </span>
            </Button>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 p-3 md:min-w-0">
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
                      <li className="px-2 py-1 text-sm text-muted-foreground">
                        No results yet. They appear here after a successful run
                        or stress test.
                      </li>
                    ) : (
                      lastRunLogs.map((log) => (
                        <li
                          key={log.id}
                          className="min-w-0 overflow-hidden rounded-md border border-border bg-muted/35 px-3 py-2 text-xs shadow-sm dark:border-border dark:bg-muted/25"
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

      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New workflow</DialogTitle>
            <DialogDescription>
              Workflows are stored in your browser only.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitNewWorkflow}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameId != null}
        onOpenChange={(open) => {
          if (!open) setRenameId(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename workflow</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            placeholder="Name"
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameId(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitRename}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
