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
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { CheckCircle2, Download, Loader2, XCircle } from "lucide-react"
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
  if (label) return label.length > 20 ? `${label.slice(0, 20)}…` : label
  if (n.type === "http") {
    const m = n.data.method
    return m.length > 14 ? `${m.slice(0, 14)}…` : m
  }
  return n.type
}

function chartPalette(dark: boolean) {
  return dark
    ? {
        grid: "rgba(255,255,255,0.06)",
        axisLine: "rgba(255,255,255,0.12)",
        tick: "#a1a1aa",
        tickMuted: "#71717a",
        bar: "#6366f1",
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

async function renderDashboardPdf(
  element: HTMLElement,
  fileBase: string,
  dark: boolean,
): Promise<void> {
  const html2canvas = (await import("html2canvas")).default
  const { jsPDF } = await import("jspdf")

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: dark ? "#09090b" : "#fafafa",
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  })

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 10
  const maxW = pageW - margin * 2
  const maxH = pageH - margin * 2
  const imgW = maxW
  const imgH = (canvas.height * imgW) / canvas.width

  if (imgH <= maxH) {
    const imgData = canvas.toDataURL("image/png", 1.0)
    pdf.addImage(imgData, "PNG", margin, margin, imgW, imgH)
  } else {
    const srcHPerPage = (maxH * canvas.width) / imgW
    let srcY = 0
    let first = true
    while (srcY < canvas.height - 0.5) {
      const sliceH = Math.min(srcHPerPage, canvas.height - srcY)
      const sliceCanvas = document.createElement("canvas")
      sliceCanvas.width = canvas.width
      sliceCanvas.height = sliceH
      const ctx = sliceCanvas.getContext("2d")
      if (!ctx) break
      ctx.drawImage(
        canvas,
        0,
        srcY,
        canvas.width,
        sliceH,
        0,
        0,
        canvas.width,
        sliceH,
      )
      const sliceData = sliceCanvas.toDataURL("image/png", 1.0)
      const drawH = (sliceH * imgW) / canvas.width
      if (!first) pdf.addPage()
      pdf.addImage(sliceData, "PNG", margin, margin, imgW, drawH)
      first = false
      srcY += sliceH
    }
  }

  const safe =
    fileBase.replace(/[^a-z0-9-_]+/gi, "-").slice(0, 48) || "dashboard"
  pdf.save(`flowcheck-${safe}.pdf`)
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
      }))
    }
    return nodes
      .filter((n) => n.data.lastLatencyMs != null)
      .map((n) => ({
        name: nodeShortLabel(nodes, n.id),
        avgMs: Math.round((n.data.lastLatencyMs ?? 0) * 10) / 10,
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

  const logCount = wf?.lastRunLogs?.length ?? 0
  const stressCount = wf?.stressHistory?.length ?? 0
  const hasLatency = latencyRows.length > 0
  const hasAnyRunData =
    logCount > 0 || stressCount > 0 || hasLatency || health.ok + health.fail > 0

  const tooltipStyle = useMemo(
    () => ({
      backgroundColor: palette.tooltipBg,
      border: `1px solid ${palette.tooltipBorder}`,
      borderRadius: "12px",
      fontSize: "12px",
      color: palette.tooltipFg,
      boxShadow: dark
        ? "0 12px 40px rgba(0,0,0,0.5)"
        : "0 8px 24px rgba(0,0,0,0.08)",
    }),
    [palette, dark],
  )

  const onDownloadPdf = useCallback(async () => {
    const el = exportRef.current
    if (!el) return
    setPdfBusy(true)
    try {
      await renderDashboardPdf(el, title, dark)
    } catch {
      /* retry-friendly */
    } finally {
      setPdfBusy(false)
    }
  }, [dark, title])

  if (!wf) {
    return (
      <p className="text-sm text-muted-foreground">No workflow selected.</p>
    )
  }

  const logFailed = (log: RunLogEntry) =>
    Boolean(log.error) || (log.statusCode != null && log.statusCode >= 400)

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-8 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500",
        className,
      )}
    >
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
        className="flex flex-col gap-10"
      >
        {!hasAnyRunData ? (
          <div className="rounded-3xl border border-dashed border-border/80 bg-muted/20 px-8 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
            <p className="text-sm text-muted-foreground">
              Run or stress-test this flow — your dashboard lights up with health,
              timing, and history.
            </p>
          </div>
        ) : (
          <>
            <section
              className={cn(
                "relative overflow-hidden rounded-3xl border px-8 py-10 sm:px-12 sm:py-12",
                "border-border/60 bg-gradient-to-br shadow-2xl backdrop-blur-xl",
                "from-white via-zinc-50/80 to-indigo-50/40",
                "dark:from-zinc-900 dark:via-zinc-900/90 dark:to-indigo-950/50 dark:border-zinc-800",
              )}
            >
              <div
                className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-indigo-500/15 blur-3xl dark:bg-indigo-500/20"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -bottom-16 -left-16 size-56 rounded-full bg-emerald-500/10 blur-3xl dark:bg-emerald-500/15"
                aria-hidden
              />
              <div className="relative flex flex-col items-center text-center">
                {health.tone === "good" ? (
                  <CheckCircle2
                    className="mb-4 size-14 text-emerald-500 drop-shadow-[0_0_24px_rgba(16,185,129,0.45)] motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-300"
                    aria-hidden
                  />
                ) : health.tone === "bad" ? (
                  <XCircle
                    className="mb-4 size-14 text-rose-500 drop-shadow-[0_0_24px_rgba(244,63,94,0.4)] motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-300"
                    aria-hidden
                  />
                ) : (
                  <div
                    className="mb-4 size-14 rounded-full border-2 border-dashed border-muted-foreground/30"
                    aria-hidden
                  />
                )}
                <p className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                  {health.tone === "good"
                    ? "All clear"
                    : health.tone === "bad"
                      ? "Needs attention"
                      : "Ready to run"}
                </p>
                <p className="mt-3 max-w-md text-sm text-muted-foreground">
                  {health.tone === "good"
                    ? `${health.ok} block(s) succeeded on the canvas.`
                    : health.tone === "bad"
                      ? `${health.fail} block(s) reported failures. Open Results for detail.`
                      : "Execute the workflow to populate live health and timings."}
                </p>
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-card/60 px-6 py-5 shadow-lg backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/50">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Activity
                </p>
                <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-foreground">
                  {logCount}
                </p>
                <p className="text-xs text-muted-foreground">log lines stored</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-card/60 px-6 py-5 shadow-lg backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/50">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Stress history
                </p>
                <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-foreground">
                  {stressCount}
                </p>
                <p className="text-xs text-muted-foreground">saved batches</p>
              </div>
            </div>

            {timeline.length > 0 ? (
              <section aria-label="Run timeline">
                <h3 className="mb-4 text-sm font-semibold tracking-tight">
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
                              "absolute left-2 top-1/2 size-3 -translate-y-1/2 rounded-full ring-2 ring-background",
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
                          <div className="min-w-0 flex-1 rounded-2xl border border-border/50 bg-muted/30 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
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

            <section aria-label="Nodes">
              <h3 className="mb-4 text-sm font-semibold tracking-tight">
                Blocks
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {wf.nodes.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "group rounded-2xl border border-border/70 bg-card/50 p-4 shadow-md backdrop-blur-sm transition-all duration-300",
                      "hover:-translate-y-0.5 hover:border-indigo-500/25 hover:shadow-xl dark:border-zinc-800 dark:bg-zinc-900/40",
                    )}
                  >
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

            {hasLatency ? (
              <section aria-label="Latency chart">
                <h3 className="mb-4 text-sm font-semibold tracking-tight">
                  Latency
                </h3>
                <div className="h-[200px] w-full min-w-0 rounded-2xl border border-border/70 bg-card/40 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={latencyRows}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        stroke={palette.grid}
                        strokeDasharray="4 4"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{
                          fill: palette.tickMuted,
                          fontSize: 10,
                        }}
                        tickLine={false}
                        axisLine={{ stroke: palette.axisLine }}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={48}
                      />
                      <YAxis
                        tick={{ fill: palette.tickMuted, fontSize: 10 }}
                        tickLine={false}
                        axisLine={{ stroke: palette.axisLine }}
                        width={36}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend
                        wrapperStyle={{
                          fontSize: 11,
                          color: palette.tick,
                          paddingTop: 8,
                        }}
                      />
                      <Bar
                        dataKey="avgMs"
                        name="ms"
                        fill={palette.bar}
                        radius={[8, 8, 0, 0]}
                        maxBarSize={40}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
