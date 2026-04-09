import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Copy,
  FilePlus,
  FolderOpen,
  Globe,
  LayoutPanelLeft,
  Loader2,
  Moon,
  Pencil,
  Play,
  Plus,
  Save,
  ScrollText,
  Search,
  Sparkles,
  Sun,
  Trash2,
  User,
  type LucideIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react"
import { toast } from "sonner"
import { PerformanceDashboard } from "@/components/dashboard/PerformanceDashboard"
import { CurlImportDialog } from "@/components/curl/CurlImportDialog"
import { FlowCanvas } from "@/components/flow/FlowCanvas"
import { NodeInspector } from "@/components/flow/NodeInspector"
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
import type { FlowNodeKind } from "@/types/flow"

type PaletteItem = {
  kind: FlowNodeKind
  title: string
  blurb: string
  Icon: LucideIcon
}

const PALETTE_ITEMS: PaletteItem[] = [
  {
    kind: "http",
    title: "HTTP Request",
    blurb: "Request via backend proxy; paste cURL on the node.",
    Icon: Globe,
  },
]

type PaletteCategoryId = "api"

const PALETTE_CATEGORIES: {
  id: PaletteCategoryId
  label: string
  description: string
  Icon: LucideIcon
  kinds: FlowNodeKind[]
}[] = [
  {
    id: "api",
    label: "API",
    description: "Network I/O",
    Icon: Globe,
    kinds: ["http"],
  },
]

function itemForKind(kind: FlowNodeKind): PaletteItem | undefined {
  return PALETTE_ITEMS.find((p) => p.kind === kind)
}

function InspectorPanel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 shadow-xl backdrop-blur-xl dark:border-white/[0.07] dark:bg-slate-950/40",
        className,
      )}
    >
      <div className="shrink-0 border-b border-white/10 bg-gradient-to-r from-blue-500/15 via-sky-500/5 to-transparent px-4 py-3 dark:border-white/[0.06]">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300/80">
          Editor
        </p>
        <p className="text-sm font-semibold tracking-tight text-foreground">
          Properties
        </p>
      </div>
      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="p-4 pb-6">
          <NodeInspector />
        </div>
      </ScrollArea>
    </div>
  )
}

export function AppShell() {
  const { resolvedTheme, toggleTheme } = useTheme()
  const workflows = useWorkflowStore((s) => s.workflows)
  const activeWorkflowId = useWorkflowStore((s) => s.activeWorkflowId)
  const activeWf = useWorkflowStore(selectActiveWorkflow)
  const nodes = activeWf?.nodes ?? []
  const edges = activeWf?.edges ?? []
  const addNode = useWorkflowStore((s) => s.addNode)
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
  const saveFlow = useWorkflowStore((s) => s.saveFlow)
  const loadFlow = useWorkflowStore((s) => s.loadFlow)
  const clearActiveWorkflowGraph = useWorkflowStore(
    (s) => s.clearActiveWorkflowGraph,
  )
  const loadFlowInputRef = useRef<HTMLInputElement>(null)

  const [stressIterations, setStressIterations] = useState(5)
  const [paletteQuery, setPaletteQuery] = useState("")
  const [flowNameDraft, setFlowNameDraft] = useState("")
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

  useEffect(() => {
    setFlowNameDraft(activeWf?.name ?? "")
  }, [activeWf?.id, activeWf?.name])

  const paletteFiltered = useMemo(() => {
    const qTrim = paletteQuery.trim()
    const qLower = qTrim.toLowerCase()
    const match = (item: PaletteItem) => {
      if (!qLower) return true
      return (
        item.title.toLowerCase().includes(qLower) ||
        item.blurb.toLowerCase().includes(qLower)
      )
    }
    const rows = PALETTE_CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.kinds
        .map((k) => itemForKind(k))
        .filter((x): x is PaletteItem => x != null && match(x)),
    }))
    return qTrim
      ? rows.filter((c) => c.items.length > 0)
      : rows
  }, [paletteQuery])

  const onPaletteClick = useCallback(
    (kind: FlowNodeKind) => {
      addNode(kind)
      toast.success(`${kind} block added`)
    },
    [addNode],
  )

  const onRun = async () => {
    if (!nodes.length) {
      toast.error("Add at least one block to run the workflow.")
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
      toast.error("Add at least one block to stress test.")
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
        toast.error("Add at least one block to export a script.")
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

  const onSaveFlowFile = useCallback(() => {
    const payload = saveFlow()
    if (!payload) {
      toast.error("Nothing to save.")
      return
    }
    const slug = slugifyFilename(payload.name)
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
    try {
      downloadTextFile(
        JSON.stringify(payload, null, 2),
        `flowcheck-${slug}-${stamp}.flow.json`,
        "application/json",
      )
      toast.success("Flow saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    }
  }, [saveFlow])

  const onPickLoadFlow = useCallback(() => {
    loadFlowInputRef.current?.click()
  }, [])

  const onLoadFlowFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const text = String(reader.result ?? "")
          const json: unknown = JSON.parse(text)
          const res = loadFlow(json)
          if (res.ok) {
            toast.success("Flow loaded")
          } else {
            toast.error(res.message)
          }
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Could not parse JSON file",
          )
        }
      }
      reader.onerror = () => toast.error("Could not read file")
      reader.readAsText(file)
    },
    [loadFlow],
  )

  const onNewFlowGraph = useCallback(() => {
    if (
      !window.confirm(
        "Clear the current workflow canvas (nodes and edges)? Logs and stress history for this workflow will be cleared.",
      )
    ) {
      return
    }
    clearActiveWorkflowGraph()
    toast.success("Canvas cleared")
  }, [clearActiveWorkflowGraph])

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
    <div className="relative flex h-svh max-h-svh flex-col overflow-hidden bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-100"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -30%, color-mix(in oklab, var(--fc-accent) 22%, transparent), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 0%, color-mix(in oklab, var(--fc-accent-muted) 12%, transparent), transparent 45%)",
        }}
      />
      <header className="relative z-10 flex h-[3.25rem] min-w-0 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-card/70 px-3 shadow-lg backdrop-blur-2xl sm:h-14 sm:px-4 dark:border-white/[0.06] dark:bg-slate-950/55">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="shrink-0 border-white/15 bg-white/5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]"
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            onClick={() => setSidebarOpen((o) => !o)}
          >
            <LayoutPanelLeft className="size-4" />
          </Button>
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
              <Sparkles className="size-4 text-white" />
            </div>
            <div className="min-w-0 hidden sm:block">
              <h1 className="truncate bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-sm font-bold tracking-tight dark:from-white dark:to-white/75">
                FlowCheck
              </h1>
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">
                Visual workflow lab
              </p>
            </div>
          </div>
        </div>

        <div className="hidden min-w-0 max-w-md flex-1 px-2 md:flex md:justify-center">
          <div className="flex w-full max-w-sm flex-col gap-0.5">
            <label htmlFor="fc-flow-name" className="sr-only">
              Flow name
            </label>
            <Input
              id="fc-flow-name"
              value={flowNameDraft}
              onChange={(e) => setFlowNameDraft(e.target.value)}
              onBlur={() => {
                if (!activeWf) return
                const next = flowNameDraft.trim() || activeWf.name
                if (next !== activeWf.name) {
                  renameWorkflow(activeWorkflowId, next)
                }
                setFlowNameDraft(next)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur()
              }}
              className="h-9 border-white/15 bg-white/[0.06] text-center text-sm font-medium shadow-inner backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]"
              placeholder="Untitled flow"
            />
            <p className="text-center text-[10px] text-muted-foreground">
              Active workflow · press Enter to save name
            </p>
          </div>
        </div>

        <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <input
            ref={loadFlowInputRef}
            type="file"
            accept=".json,application/json,.flow.json"
            className="sr-only"
            aria-hidden
            tabIndex={-1}
            onChange={onLoadFlowFile}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-white/15 bg-white/5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]"
            title="Download current flow as .flow.json"
            onClick={onSaveFlowFile}
          >
            <Save className="size-3.5" />
            <span className="hidden sm:inline">Save</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-white/15 bg-white/5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]"
            title="Load a .flow.json file"
            onClick={onPickLoadFlow}
          >
            <FolderOpen className="size-3.5" />
            <span className="hidden sm:inline">Load</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-white/15 bg-white/5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]"
            title="Clear nodes and edges on the active workflow"
            onClick={onNewFlowGraph}
          >
            <FilePlus className="size-3.5" />
            <span className="hidden sm:inline">New</span>
          </Button>
          <Sheet>
            <SheetTrigger
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "cursor-pointer gap-1.5 border-white/15 bg-white/5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]",
              )}
            >
              <BarChart3 className="size-3.5" />
              <span className="hidden sm:inline">Dashboard</span>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 border-l border-white/10 bg-slate-950/90 p-0 backdrop-blur-2xl sm:max-w-lg dark:border-white/[0.08]"
            >
              <SheetHeader className="shrink-0 space-y-1.5 border-b border-white/10 px-4 py-4 pr-14 text-left dark:border-white/[0.06]">
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
          <div
            className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/5 py-1 pl-1 pr-2.5 shadow-sm backdrop-blur-md sm:flex dark:border-white/10 dark:bg-white/[0.04]"
            title="Signed in locally"
          >
            <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/90 to-indigo-600 text-[10px] font-bold text-white shadow-inner">
              <User className="size-3.5 opacity-95" />
            </div>
            <span className="text-xs font-medium text-foreground/90">You</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="shrink-0 border-white/15 bg-white/5 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]"
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
                "cursor-pointer gap-1 border-white/15 bg-white/5 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]",
              )}
            >
              <span className="hidden sm:inline">Export</span>
              <span className="sm:hidden">Script</span>
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
            className={cn(
              "gap-2 px-4 shadow-lg shadow-blue-500/20 transition-all duration-200",
              "bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-500/95 hover:to-indigo-600/95",
              "active:scale-[0.98] disabled:shadow-none",
            )}
            disabled={runInFlight || !nodes.length}
            onClick={() => void onRun()}
          >
            {runInFlight ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5 fill-current" />
            )}
            <span className="hidden font-semibold sm:inline">
              {runInFlight ? "Running…" : "Run"}
            </span>
          </Button>
        </div>
      </header>

      <div className="relative z-[1] border-b border-white/10 bg-card/50 px-3 py-2 backdrop-blur-md md:hidden dark:border-white/[0.06] dark:bg-slate-950/40">
        <label htmlFor="fc-flow-name-mobile" className="sr-only">
          Flow name
        </label>
        <Input
          id="fc-flow-name-mobile"
          value={flowNameDraft}
          onChange={(e) => setFlowNameDraft(e.target.value)}
          onBlur={() => {
            if (!activeWf) return
            const next = flowNameDraft.trim() || activeWf.name
            if (next !== activeWf.name) {
              renameWorkflow(activeWorkflowId, next)
            }
            setFlowNameDraft(next)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          }}
          className="h-9 border-white/15 bg-white/[0.06] text-sm font-medium dark:border-white/10"
          placeholder="Flow name"
        />
      </div>

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col md:flex-row">
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close sidebar"
            className="fixed inset-0 z-30 bg-black/55 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
        <aside
          id="app-sidebar"
          className={cn(
            "flex min-h-0 w-full max-w-[300px] flex-col overflow-x-hidden overflow-y-auto border-white/10 bg-sidebar/85 backdrop-blur-2xl transition-[transform,width,opacity] duration-300 ease-out dark:border-white/[0.06] dark:bg-slate-950/55",
            "fixed bottom-0 left-0 top-[6.25rem] z-40 border-b border-r shadow-2xl sm:top-[6.5rem] md:static md:top-auto md:z-auto md:max-w-none md:border-b-0 md:shadow-none",
            "md:w-[300px] md:max-w-[300px] md:shrink-0 md:border-r",
            sidebarOpen
              ? "translate-x-0"
              : "-translate-x-full md:translate-x-0 md:w-0 md:max-w-0 md:overflow-hidden md:border-0 md:opacity-0 md:shadow-none md:pointer-events-none",
          )}
        >
          <div className="space-y-2 border-b border-white/10 p-4 dark:border-white/[0.06]">
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
                        "flex min-w-0 items-center gap-1 rounded-xl border px-1.5 py-1 transition-colors",
                        w.id === activeWorkflowId
                          ? "border-blue-400/45 bg-blue-500/15 shadow-[0_0_20px_-8px_rgba(59,130,246,0.45)]"
                          : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07] dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]",
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

          <div className="space-y-2 border-b border-white/10 p-4 dark:border-white/[0.06]">
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
                className="h-8 w-16 rounded-lg border-white/15 bg-white/[0.05] dark:border-white/10"
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

          <div className="space-y-3 border-b border-white/10 p-4 dark:border-white/[0.06]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder="Search blocks…"
                className="h-9 border-white/15 bg-white/[0.05] pl-8 text-sm dark:border-white/10"
              />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Drag a card onto the canvas or tap to add. Connect top → bottom
              for order; branch for parallel waves.
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-5 p-4 pb-8">
            {paletteFiltered.map((cat) => {
              const CategoryIcon = cat.Icon
              return (
              <div key={cat.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] dark:border-white/[0.08]">
                    <CategoryIcon className="size-3.5 text-blue-300/90" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/90">
                      {cat.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {cat.description}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {cat.items.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-3 text-[11px] italic text-muted-foreground dark:border-white/[0.07]">
                      More blocks soon.
                    </p>
                  ) : (
                    cat.items.map(({ kind, title, blurb, Icon }) => (
                      <div
                        key={kind}
                        role="button"
                        tabIndex={0}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/reactflow", kind)
                          e.dataTransfer.effectAllowed = "move"
                        }}
                        onClick={() => onPaletteClick(kind)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            onPaletteClick(kind)
                          }
                        }}
                        className={cn(
                          "group flex h-auto w-full max-w-full cursor-grab flex-col items-start gap-1 rounded-xl border py-2.5 pl-3 pr-2 text-left shadow-md outline-none transition-all duration-200",
                          "border-white/12 bg-gradient-to-br from-white/[0.07] to-transparent hover:border-blue-400/35 hover:shadow-lg hover:shadow-blue-500/10 active:cursor-grabbing",
                          "dark:border-white/[0.08] dark:from-white/[0.05] dark:to-transparent dark:hover:border-blue-400/30",
                          "focus-visible:ring-2 focus-visible:ring-blue-400/40",
                        )}
                      >
                        <span className="flex w-full min-w-0 items-center gap-2">
                          <Icon className="size-4 shrink-0 text-blue-300/80 transition-colors group-hover:text-blue-200" />
                          <span className="min-w-0 text-sm font-semibold tracking-tight break-words text-foreground">
                            {title}
                          </span>
                        </span>
                        <span className="w-full min-w-0 pl-6 text-left text-[11px] leading-snug break-words text-muted-foreground">
                          {blurb}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              )
            })}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 p-2 sm:p-3 md:min-w-0">
            <div className="min-h-0 flex-1">
              <FlowCanvas />
            </div>

            <div className="mt-2 max-h-[40vh] min-h-[200px] shrink-0 lg:hidden">
              <InspectorPanel className="h-full" />
            </div>

            <div
              className={cn(
                "mt-2 flex shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-card/45 shadow-xl backdrop-blur-xl transition-all dark:border-white/[0.06] dark:bg-slate-950/40",
                bottomHeight,
              )}
            >
            <button
              type="button"
              className="flex min-w-0 w-full cursor-pointer items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04] dark:border-white/[0.06]"
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
                          className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs shadow-sm dark:border-white/[0.07] dark:bg-white/[0.03]"
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
                            {log.outcome ? (
                              <span className="shrink-0 rounded border border-border/80 bg-background/80 px-1 py-px capitalize">
                                {log.outcome.replace(/_/g, " ")}
                              </span>
                            ) : null}
                            {log.attempts != null && log.attempts > 1 ? (
                              <span className="shrink-0">{log.attempts}×</span>
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
                          {log.errorDetail ? (
                            <p className="mt-1 text-[11px] break-words whitespace-pre-wrap text-muted-foreground">
                              {log.errorDetail}
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

          <aside className="hidden min-h-0 w-full max-w-md shrink-0 flex-col border-l border-white/10 bg-transparent py-3 pl-0 pr-3 lg:flex xl:max-w-[24rem] dark:border-white/[0.06]">
            <InspectorPanel className="min-h-0 flex-1" />
          </aside>
        </div>
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
