import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Activity, CheckCircle2, Clock, Download, Loader2, TrendingUp, XCircle, Zap } from "lucide-react"
import { useTheme } from "@/components/theme/ThemeProvider"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  selectActiveWorkflow,
  useWorkflowStore,
} from "@/store/workflowStore"
import type { AppNode, RunLogEntry } from "@/types/flow"

function nodeShortLabel(nodes: AppNode[], nodeId: string): string {
  const n = nodes.find((x) => x.id === nodeId)
  if (!n) return nodeId.slice(0, 8)

  const label = n.data.label?.trim()
  if (label && label !== "HTTP Request" && label !== "Code" && label !== "Condition" && label !== "Trigger") {
    return label.length > 20 ? `${label.slice(0, 20)}…` : label
  }

  if (n.type === "http") {
    try {
      const url = new URL(n.data.url || "https://example.com")
      const path = url.pathname === "/" ? url.hostname : url.pathname
      const str = `${n.data.method || "GET"} ${path}`
      return str.length > 18 ? `${str.slice(0, 18)}…` : str
    } catch {
      const str = `${n.data.method || "GET"} ${n.data.url || ""}`
      return str.length > 18 ? `${str.slice(0, 18)}…` : str
    }
  }

  if (n.type === "code") return `Code ${nodeId.slice(0, 4)}`
  if (n.type === "condition") return `Condition ${nodeId.slice(0, 4)}`

  return n.type.charAt(0).toUpperCase() + n.type.slice(1)
}

function chartPalette(dark: boolean) {
  return dark
    ? {
        grid: "rgba(255,255,255,0.06)",
        axisLine: "rgba(255,255,255,0.12)",
        tick: "#a1a1aa",
        tickMuted: "#71717a",
        bar: "#6366f1",
        barSecondary: "#34d399",
        tooltipBg: "#18181b",
        tooltipBorder: "#27272a",
        tooltipFg: "#fafafa",
        glowOk: "rgba(52,211,153,0.5)",
        glowBad: "rgba(244,63,94,0.45)",
      }
    : {
        grid: "rgba(0,0,0,0.05)",
        axisLine: "rgba(0,0,0,0.1)",
        tick: "#3f3f46",
        tickMuted: "#71717a",
        bar: "#4f46e5",
        barSecondary: "#10b981",
        tooltipBg: "#ffffff",
        tooltipBorder: "#e4e4e7",
        tooltipFg: "#18181b",
        glowOk: "rgba(16,185,129,0.35)",
        glowBad: "rgba(244,63,94,0.3)",
      }
}

function dotClass(run: AppNode["data"]["runStatus"]): string {
  if (run === "success")
    return "bg-emerald-400 shadow-[0_0_14px_var(--glow)]"
  if (run === "fail")
    return "bg-rose-500 shadow-[0_0_14px_var(--glow)]"
  if (run === "running")
    return "bg-indigo-400 animate-pulse shadow-[0_0_12px_rgba(99,102,241,0.5)]"
  return "bg-zinc-400"
}

async function generateNativePdfReport(
  wf: any,
  fileBase: string,
  dark: boolean,
): Promise<void> {
  const { jsPDF } = await import("jspdf")
  const autoTable = (await import("jspdf-autotable")).default

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  let y = 15

  const addText = (txt: string, size: number, isBold = false, x = 14) => {
    doc.setFont("helvetica", isBold ? "bold" : "normal")
    doc.setFontSize(size)
    doc.text(txt, x, y)
    y += size * 0.4 + 2
  }

  // Header
  addText(`FlowCheck Execution Report: ${fileBase}`, 18, true)
  y += 2
  addText(`Generated on: ${new Date().toLocaleString()}`, 10)
  y += 8

  // Workflow Overview
  const nodes = wf.nodes || []
  const fail = nodes.filter((n: any) => n.data.runStatus === "fail").length
  const ok = nodes.filter((n: any) => n.data.runStatus === "success").length
  const successRate = ok + fail > 0 ? Math.round((ok / (ok + fail)) * 100) : 0

  addText("Overview", 14, true)
  addText(`Total Blocks: ${nodes.length}`, 11)
  addText(`Success Rate: ${successRate}% (${ok} passed, ${fail} failed)`, 11)
  addText(`Log Entries: ${wf.lastRunLogs?.length || 0}`, 11)
  addText(`Stress Runs: ${wf.stressHistory?.length || 0}`, 11)
  y += 8

  // Node Information
  addText("Node Information", 14, true)
  y += 2
  const nodeData = nodes.map((n: any) => [
    n.id.slice(0, 8),
    n.type.toUpperCase(),
    n.data.label || "-",
    n.data.method || "-",
    n.data.url || "-",
    n.data.runStatus || "idle",
    n.data.lastLatencyMs != null ? `${n.data.lastLatencyMs.toFixed(1)} ms` : "-",
  ])

  autoTable(doc, {
    startY: y,
    head: [["ID", "Type", "Label", "Method", "URL", "Status", "Latency"]],
    body: nodeData,
    theme: dark ? "grid" : "striped",
    headStyles: { fillColor: [79, 70, 229] },
    styles: { fontSize: 8, cellPadding: 2 },
  })
  y = (doc as any).lastAutoTable.finalY + 12

  // Timeline / Recent Logs
  const logs = wf.lastRunLogs || []
  if (logs.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage()
      y = 15
    }

    addText("Execution Timeline (Recent Logs)", 14, true)
    y += 2
    const logData = logs.slice(0, 30).map((l: any) => [
      new Date(l.at).toLocaleTimeString(),
      l.nodeId.slice(0, 8),
      l.method || "-",
      l.statusCode || "-",
      l.durationMs != null ? `${l.durationMs.toFixed(1)} ms` : "-",
      l.outcome || "-",
      l.error ? "Yes" : "No"
    ])

    autoTable(doc, {
      startY: y,
      head: [["Time", "Node ID", "Method", "Code", "Latency", "Outcome", "Error"]],
      body: logData,
      theme: dark ? "grid" : "striped",
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 8, cellPadding: 2 },
    })
    y = (doc as any).lastAutoTable.finalY + 12
  }

  // Stress Performance Details
  const stress = wf.stressHistory?.[0]
  if (stress) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage()
      y = 15
    }

    addText("Latest Stress Performance Details", 14, true)
    addText(`Concurrency: ${stress.concurrency} | Batches: ${stress.batches}`, 11)
    y += 2

    const stressData = Object.entries(stress.perNode).map(([id, st]: [string, any]) => [
      id.slice(0, 8),
      `${st.avgMs.toFixed(1)} ms`,
      `${st.minMs.toFixed(1)} ms`,
      `${st.maxMs.toFixed(1)} ms`,
      st.errors
    ])

    autoTable(doc, {
      startY: y,
      head: [["Node ID", "Avg Latency", "Min Latency", "Max Latency", "Errors"]],
      body: stressData,
      theme: dark ? "grid" : "striped",
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 8, cellPadding: 2 },
    })
  }

  const safe = fileBase.replace(/[^a-z0-9-_]+/gi, "-").slice(0, 48) || "report"
  doc.save(`flowcheck-${safe}.pdf`)
}

/* ─── Stat Card ─── */
function StatCard({
  label,
  value,
  sub,
  Icon,
  accentClass,
}: {
  label: string
  value: string | number
  sub: string
  Icon: typeof Activity
  accentClass: string
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 p-5 sm:p-6 shadow-lg backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl dark:border-zinc-800/80 dark:from-zinc-900/60 dark:to-zinc-950/40">
      <div className={cn("absolute -right-4 -top-4 size-20 rounded-full opacity-[0.07] blur-2xl transition-opacity group-hover:opacity-[0.12]", accentClass)} aria-hidden />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
          <p className="mt-2 font-mono text-3xl font-bold tabular-nums tracking-tight text-foreground sm:text-4xl">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl shadow-lg", accentClass)}>
          <Icon className="size-5 text-white" />
        </div>
      </div>
    </div>
  )
}

export function PerformanceDashboard({
  workflowTitle,
  className,
}: {
  workflowTitle?: string
  className?: string
}) {
  const wf = useWorkflowStore(selectActiveWorkflow)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  const palette = useMemo(() => chartPalette(dark), [dark])
  const exportRef = useRef<HTMLDivElement>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  const title = workflowTitle ?? wf?.name ?? "Workflow"

  const latencyRows = useMemo(() => {
    const nodes = wf?.nodes ?? []
    const latestStress = wf?.stressHistory?.[0]
    if (latestStress) {
      return Object.entries(latestStress.perNode).map(([nodeId, st]) => ({
        name: nodeShortLabel(nodes, nodeId),
        avgMs: Math.round(st.avgMs * 10) / 10,
        status: nodes.find((n) => n.id === nodeId)?.data.runStatus || "idle",
      }))
    }
    return nodes
      .filter((n) => n.data.lastLatencyMs != null)
      .map((n) => ({
        name: nodeShortLabel(nodes, n.id),
        avgMs: Math.round((n.data.lastLatencyMs ?? 0) * 10) / 10,
        status: n.data.runStatus || "idle",
      }))
  }, [wf])

  const timeline = useMemo(() => {
    const logs = wf?.lastRunLogs ?? []
    return [...logs].slice(0, 14).reverse()
  }, [wf])

  const health = useMemo(() => {
    const nodes = wf?.nodes ?? []
    const fail = nodes.filter((n) => n.data.runStatus === "fail").length
    const ok = nodes.filter((n) => n.data.runStatus === "success").length
    if (fail > 0) return { tone: "bad" as const, fail, ok }
    if (ok > 0) return { tone: "good" as const, fail, ok }
    return { tone: "idle" as const, fail: 0, ok: 0 }
  }, [wf])

  const avgLatency = useMemo(() => {
    if (!latencyRows.length) return 0
    return Math.round(latencyRows.reduce((s, r) => s + r.avgMs, 0) / latencyRows.length * 10) / 10
  }, [latencyRows])

  const logCount = wf?.lastRunLogs?.length ?? 0
  const stressCount = wf?.stressHistory?.length ?? 0
  const hasLatency = latencyRows.length > 0
  const hasAnyRunData =
    logCount > 0 || stressCount > 0 || hasLatency || health.ok + health.fail > 0

  const onDownloadPdf = useCallback(async () => {
    if (!wf) return
    setPdfBusy(true)

    try {
      await generateNativePdfReport(wf, title, dark)
    } catch (err) {
      console.error("PDF generation failed:", err)
      alert("Failed to generate PDF. Please try again or check console for details.")
    } finally {
      setPdfBusy(false)
    }
  }, [wf, dark, title])

  if (!wf) {
    return (
      <p className="text-sm text-muted-foreground">No workflow selected.</p>
    )
  }

  const logFailed = (log: RunLogEntry) =>
    Boolean(log.error) || (log.statusCode != null && log.statusCode >= 400)

  const successRate = health.ok + health.fail > 0
    ? Math.round((health.ok / (health.ok + health.fail)) * 100)
    : 0

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-8 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500",
        className,
      )}
    >
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600/90 dark:text-indigo-400/90">
            Execution
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pdfBusy || !hasAnyRunData}
          className="shrink-0 gap-2 rounded-xl border-border/80 bg-background/80 shadow-sm backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/80"
          aria-label="Download dashboard as PDF"
          onClick={() => void onDownloadPdf()}
        >
          {pdfBusy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          Download PDF
        </Button>
      </div>

      <div
        id="fc-dashboard-export-root"
        ref={exportRef}
      >
        {!hasAnyRunData ? (
          /* ── Empty state ── */
          <div className="relative overflow-hidden rounded-3xl border border-dashed border-border/60 bg-gradient-to-br from-muted/10 via-transparent to-indigo-500/[0.03] px-8 py-20 text-center dark:border-zinc-800 dark:from-zinc-900/20 dark:to-indigo-950/10">
            <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-500/15" aria-hidden />
            <div className="pointer-events-none absolute -bottom-12 -left-12 size-40 rounded-full bg-emerald-500/8 blur-3xl dark:bg-emerald-500/10" aria-hidden />
            <div className="relative">
              <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl border border-border/50 bg-gradient-to-br from-indigo-500/10 to-emerald-500/10 dark:border-zinc-700 dark:from-indigo-500/15 dark:to-emerald-500/15">
                <Activity className="size-7 text-indigo-500/70 dark:text-indigo-400/70" />
              </div>
              <p className="text-lg font-semibold text-foreground/80">No execution data yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                Run or stress-test this flow — your dashboard lights up with health,
                timing, and history.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 xl:gap-12">
            {/* ── Left Column ── */}
            <div className="flex min-w-0 flex-col gap-8 lg:col-span-7 xl:col-span-8">
            {/* ── Health Hero ── */}
            <section
              className={cn(
                "relative overflow-hidden rounded-3xl border px-8 py-12 sm:px-12 sm:py-14",
                "border-border/40 shadow-2xl backdrop-blur-xl",
                health.tone === "good"
                  ? "bg-gradient-to-br from-emerald-50/80 via-white to-indigo-50/60 dark:from-emerald-950/30 dark:via-zinc-900 dark:to-indigo-950/40 dark:border-emerald-500/15"
                  : health.tone === "bad"
                    ? "bg-gradient-to-br from-rose-50/60 via-white to-orange-50/40 dark:from-rose-950/25 dark:via-zinc-900 dark:to-orange-950/20 dark:border-rose-500/15"
                    : "bg-gradient-to-br from-white via-zinc-50/80 to-indigo-50/40 dark:from-zinc-900 dark:via-zinc-900/90 dark:to-indigo-950/50 dark:border-zinc-800",
              )}
            >
              <div
                className={cn(
                  "pointer-events-none absolute -right-20 -top-20 size-72 rounded-full blur-3xl",
                  health.tone === "good" ? "bg-emerald-500/15 dark:bg-emerald-500/20" : health.tone === "bad" ? "bg-rose-500/12 dark:bg-rose-500/18" : "bg-indigo-500/15 dark:bg-indigo-500/20",
                )}
                aria-hidden
              />
              <div
                className={cn(
                  "pointer-events-none absolute -bottom-16 -left-16 size-56 rounded-full blur-3xl",
                  health.tone === "good" ? "bg-indigo-500/8 dark:bg-indigo-500/12" : health.tone === "bad" ? "bg-amber-500/8 dark:bg-amber-500/10" : "bg-emerald-500/10 dark:bg-emerald-500/15",
                )}
                aria-hidden
              />
              <div className="relative flex flex-col items-center text-center">
                {health.tone === "good" ? (
                  <div className="mb-5 flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30 motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-300">
                    <CheckCircle2 className="size-10 text-white" aria-hidden />
                  </div>
                ) : health.tone === "bad" ? (
                  <div className="mb-5 flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-rose-400 to-rose-600 shadow-lg shadow-rose-500/30 motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-300">
                    <XCircle className="size-10 text-white" aria-hidden />
                  </div>
                ) : (
                  <div className="mb-5 size-20 rounded-3xl border-2 border-dashed border-muted-foreground/20 flex items-center justify-center" aria-hidden>
                    <Activity className="size-8 text-muted-foreground/40" />
                  </div>
                )}
                <p className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                  {health.tone === "good"
                    ? "All clear"
                    : health.tone === "bad"
                      ? "Needs attention"
                      : "Ready to run"}
                </p>
                <p className="mt-3 max-w-md text-sm text-muted-foreground">
                  {health.tone === "good"
                    ? `${health.ok} block(s) succeeded — ${successRate}% success rate.`
                    : health.tone === "bad"
                      ? `${health.fail} block(s) reported failures. Open Results for detail.`
                      : "Execute the workflow to populate live health and timings."}
                </p>
              </div>
            </section>

            {/* ── Stat Cards ── */}
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard
                label="Activity"
                value={logCount}
                sub="log entries"
                Icon={Activity}
                accentClass="bg-gradient-to-br from-indigo-500 to-indigo-600"
              />
              <StatCard
                label="Stress runs"
                value={stressCount}
                sub="saved batches"
                Icon={TrendingUp}
                accentClass="bg-gradient-to-br from-violet-500 to-purple-600"
              />
              <StatCard
                label="Avg latency"
                value={avgLatency ? `${avgLatency}` : "—"}
                sub={avgLatency ? "milliseconds" : "no data"}
                Icon={Clock}
                accentClass="bg-gradient-to-br from-amber-500 to-orange-600"
              />
              <StatCard
                label="Success rate"
                value={health.ok + health.fail > 0 ? `${successRate}%` : "—"}
                sub={health.ok + health.fail > 0 ? `${health.ok}/${health.ok + health.fail} passed` : "no runs"}
                Icon={Zap}
                accentClass="bg-gradient-to-br from-emerald-500 to-teal-600"
              />
            </div>

            {/* ── Timeline ── */}
            {timeline.length > 0 ? (
              <section aria-label="Run timeline">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <Clock className="size-4 text-muted-foreground" />
                  Timeline
                </h3>
                <div className="relative max-h-[280px] space-y-0 overflow-y-auto pr-2">
                  <div
                    className="absolute bottom-2 left-[13px] top-2 w-px bg-gradient-to-b from-indigo-500/40 via-indigo-500/20 to-transparent"
                    aria-hidden
                  />
                  <ul className="space-y-1">
                    {timeline.map((log) => {
                      const bad = logFailed(log)
                      return (
                        <li key={log.id} className="relative flex gap-4 py-2 pl-10">
                          <span
                            className={cn(
                              "absolute left-2 top-1/2 size-3 -translate-y-1/2 rounded-full ring-2 ring-background transition-transform hover:scale-125",
                              bad ? "bg-rose-500" : "bg-emerald-400",
                            )}
                            style={
                              {
                                "--tw-ring-color": dark ? "#09090b" : "#fafafa",
                                boxShadow: bad
                                  ? `0 0 12px ${palette.glowBad}`
                                  : `0 0 12px ${palette.glowOk}`,
                              } as CSSProperties
                            }
                          />
                          <div className="min-w-0 flex-1 rounded-2xl border border-border/50 bg-gradient-to-r from-muted/20 to-transparent px-4 py-3 transition-colors hover:from-muted/40 dark:border-zinc-800 dark:from-zinc-900/30 dark:hover:from-zinc-900/50">
                            <p className="truncate text-sm font-medium text-foreground">
                              {nodeShortLabel(wf.nodes, log.nodeId)}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                              {log.durationMs != null
                                ? `${log.durationMs.toFixed(0)} ms`
                                : "—"}{" "}
                              · {new Date(log.at).toLocaleTimeString()}
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </section>
            ) : null}

            {/* ── Blocks Grid ── */}
            <section aria-label="Nodes">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-tight">
                <Activity className="size-4 text-muted-foreground" />
                Blocks
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {wf.nodes.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card/70 to-card/30 p-4 shadow-md backdrop-blur-sm transition-all duration-300",
                      "hover:-translate-y-0.5 hover:shadow-xl dark:border-zinc-800/70 dark:from-zinc-900/50 dark:to-zinc-950/30",
                      n.data.runStatus === "success" && "hover:border-emerald-500/25",
                      n.data.runStatus === "fail" && "hover:border-rose-500/25",
                      n.data.runStatus !== "success" && n.data.runStatus !== "fail" && "hover:border-indigo-500/25",
                    )}
                  >
                    <div className={cn("pointer-events-none absolute -right-4 -top-4 size-12 rounded-full opacity-0 blur-xl transition-opacity group-hover:opacity-100",
                      n.data.runStatus === "success" ? "bg-emerald-500/20" : n.data.runStatus === "fail" ? "bg-rose-500/20" : "bg-indigo-500/15",
                    )} aria-hidden />
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {nodeShortLabel(wf.nodes, n.id)}
                      </p>
                      <span
                        className={cn(
                          "size-2.5 shrink-0 rounded-full",
                          dotClass(n.data.runStatus),
                        )}
                        style={
                          {
                            "--glow":
                              n.data.runStatus === "success"
                                ? palette.glowOk
                                : n.data.runStatus === "fail"
                                  ? palette.glowBad
                                  : "transparent",
                          } as CSSProperties
                        }
                      />
                    </div>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {n.type}
                    </p>
                    {n.data.lastLatencyMs != null ? (
                      <p className="mt-2 font-mono text-xs text-muted-foreground">
                        {n.data.lastLatencyMs.toFixed(1)} ms
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
            </div>

            {/* ── Right Column ── */}
            <div className="flex min-w-0 flex-col gap-8 lg:sticky lg:top-0 lg:col-span-5 xl:col-span-4">
              {/* ── Latency Chart ── */}
              {hasLatency ? (
                <section aria-label="Latency chart">
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-tight">
                    <Zap className="size-4 text-muted-foreground" />
                    Latency
                  </h3>
                  <div className="relative rounded-2xl border border-border/50 bg-gradient-to-br from-card/60 to-card/20 p-5 shadow-lg backdrop-blur-md dark:border-zinc-800/70 dark:from-zinc-900/40 dark:to-zinc-950/20">
                    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
                      <div className="absolute -right-10 -top-10 size-40 rounded-full bg-indigo-500/5 blur-3xl dark:bg-indigo-500/10" />
                    </div>
                    <div className="relative z-10 h-[500px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={latencyRows}
                        margin={{ top: 20, right: 20, left: 10, bottom: 20 }}
                      >
                        <defs>
                          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={palette.bar} stopOpacity={1} />
                            <stop offset="100%" stopColor={palette.bar} stopOpacity={0.4} />
                          </linearGradient>
                          <linearGradient id="barGradHover" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={palette.barSecondary} stopOpacity={1} />
                            <stop offset="100%" stopColor={palette.barSecondary} stopOpacity={0.6} />
                          </linearGradient>
                          <linearGradient id="barGradFail" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f43f5e" stopOpacity={1} />
                            <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.4} />
                          </linearGradient>
                          <linearGradient id="barGradFailHover" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fb923c" stopOpacity={1} />
                            <stop offset="100%" stopColor="#fb923c" stopOpacity={0.6} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          stroke={palette.grid}
                          strokeDasharray="4 4"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: palette.tickMuted, fontSize: 11, fontWeight: 500 }}
                          tickLine={false}
                          axisLine={{ stroke: palette.axisLine, strokeWidth: 1.5 }}
                          tickMargin={12}
                          interval={0}
                          angle={0}
                          textAnchor="middle"
                          height={30}
                        />
                        <YAxis
                          tick={{ fill: palette.tickMuted, fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                          width={55}
                          tickFormatter={(val) => `${val}ms`}
                        />
                        <Tooltip
                          cursor={{ fill: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", radius: 8 }}
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="rounded-xl border border-border/50 bg-card/95 p-3 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95">
                                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                                  <p className="font-mono text-lg font-bold text-foreground">
                                    {payload[0].value}<span className="ml-1 text-xs font-normal text-muted-foreground">ms</span>
                                  </p>
                                </div>
                              )
                            }
                            return null
                          }}
                          wrapperStyle={{ zIndex: 100 }}
                        />
                        <Bar
                          dataKey="avgMs"
                          name="Latency"
                          radius={[6, 6, 6, 6]}
                          maxBarSize={48}
                          animationDuration={1200}
                          animationEasing="ease-out"
                          activeBar={(props: any) => {
                            const isFail = props.payload?.status === "fail"
                            return <rect {...props} fill={isFail ? "url(#barGradFailHover)" : "url(#barGradHover)"} stroke={dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"} strokeWidth={1} />
                          }}
                        >
                          {latencyRows.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.status === "fail" ? "url(#barGradFail)" : "url(#barGrad)"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                </section>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
