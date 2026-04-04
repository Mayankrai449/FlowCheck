import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useTheme } from "@/components/theme/ThemeProvider"
import {
  selectActiveWorkflow,
  useWorkflowStore,
} from "@/store/workflowStore"

function nodeShortLabel(
  nodes: { id: string; data: { label: string; method: string } }[],
  nodeId: string,
): string {
  const n = nodes.find((x) => x.id === nodeId)
  const bit = n?.data.label?.trim() || n?.data.method || nodeId
  return bit.length > 16 ? `${bit.slice(0, 16)}…` : bit
}

function chartPalette(dark: boolean) {
  return dark
        ? {
            grid: "rgba(255,255,255,0.09)",
            axisLine: "rgba(255,255,255,0.18)",
            tick: "#d4d4d8",
            tickMuted: "#a1a1aa",
            barAvg: "#38bdf8",
            barMin: "#818cf8",
            barMax: "#c4b5fd",
            pieOk: "#4ade80",
            pieBad: "#fb7185",
            pieStroke: "rgba(255,255,255,0.2)",
            tooltipBg: "#18181b",
            tooltipBorder: "#3f3f46",
            tooltipFg: "#fafafa",
            cardBg: "rgba(39,39,42,0.55)",
            cardBorder: "rgba(255,255,255,0.1)",
            sectionBg: "rgba(24,24,27,0.65)",
          }
        : {
            grid: "rgba(0,0,0,0.06)",
            axisLine: "rgba(0,0,0,0.12)",
            tick: "#3f3f46",
            tickMuted: "#71717a",
            barAvg: "#0284c7",
            barMin: "#4f46e5",
            barMax: "#7c3aed",
            pieOk: "#16a34a",
            pieBad: "#dc2626",
            pieStroke: "rgba(0,0,0,0.08)",
            tooltipBg: "#ffffff",
            tooltipBorder: "#e4e4e7",
            tooltipFg: "#18181b",
            cardBg: "rgba(255,255,255,0.85)",
            cardBorder: "rgba(0,0,0,0.08)",
            sectionBg: "rgba(250,250,250,0.9)",
          }
}

export function PerformanceDashboard() {
  const wf = useWorkflowStore(selectActiveWorkflow)
  const { resolvedTheme } = useTheme()
  const palette = useMemo(
    () => chartPalette(resolvedTheme === "dark"),
    [resolvedTheme],
  )

  const latencyRows = useMemo(() => {
    const nodes = wf?.nodes ?? []
    const latestStress = wf?.stressHistory?.[0]
    if (latestStress) {
      return Object.entries(latestStress.perNode).map(([nodeId, st]) => ({
        name: nodeShortLabel(nodes, nodeId),
        avgMs: Math.round(st.avgMs * 10) / 10,
        minMs: Math.round(st.minMs * 10) / 10,
        maxMs: Math.round(st.maxMs * 10) / 10,
        samples: st.samples,
      }))
    }
    return nodes
      .filter((n) => n.data.lastLatencyMs != null)
      .map((n) => ({
        name: nodeShortLabel(nodes, n.id),
        avgMs: Math.round((n.data.lastLatencyMs ?? 0) * 10) / 10,
        minMs: Math.round((n.data.lastLatencyMs ?? 0) * 10) / 10,
        maxMs: Math.round((n.data.lastLatencyMs ?? 0) * 10) / 10,
        samples: 1,
      }))
  }, [wf])

  const outcomePie = useMemo(() => {
    const lastRunLogs = wf?.lastRunLogs ?? []
    const slice = lastRunLogs.slice(0, 120)
    let ok = 0
    let bad = 0
    for (const log of slice) {
      const failed =
        Boolean(log.error) ||
        (log.statusCode != null && log.statusCode >= 400)
      if (failed) bad += 1
      else ok += 1
    }
    return [
      { name: "Success", value: ok, key: "ok" },
      { name: "Failed", value: bad, key: "bad" },
    ]
  }, [wf])

  const pieDisplay = useMemo(
    () => outcomePie.filter((x) => x.value > 0),
    [outcomePie],
  )

  const tooltipStyle = useMemo(
    () => ({
      backgroundColor: palette.tooltipBg,
      border: `1px solid ${palette.tooltipBorder}`,
      borderRadius: "10px",
      fontSize: "12px",
      color: palette.tooltipFg,
      boxShadow:
        resolvedTheme === "dark"
          ? "0 8px 24px rgba(0,0,0,0.45)"
          : "0 4px 16px rgba(0,0,0,0.08)",
    }),
    [palette, resolvedTheme],
  )

  const hasLatency = latencyRows.length > 0
  const hasPie = pieDisplay.length > 0
  const logCount = wf?.lastRunLogs?.length ?? 0
  const stressCount = wf?.stressHistory?.length ?? 0
  const hasAnyRunData = logCount > 0 || stressCount > 0 || hasLatency

  if (!wf) {
    return (
      <p className="text-sm text-muted-foreground">No workflow selected.</p>
    )
  }

  if (!hasAnyRunData) {
    return (
      <div
        className="rounded-xl border px-5 py-12 text-center"
        style={{
          backgroundColor: palette.sectionBg,
          borderColor: palette.cardBorder,
        }}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          Nothing to chart yet. Open this panel after you{" "}
          <span className="font-medium text-foreground">run</span> or{" "}
          <span className="font-medium text-foreground">stress-test</span> this
          workflow — only real run data appears here.
        </p>
      </div>
    )
  }

  const latestStress = wf.stressHistory[0]

  const legendStyle = {
    fontSize: 12,
    color: palette.tick,
    paddingTop: 8,
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Log lines",
            sub: "This workflow",
            value: String(logCount),
          },
          {
            label: "Stress summaries",
            sub: "Stored locally",
            value: String(stressCount),
          },
          {
            label: "Last stress batch",
            sub: "Iterations",
            value: latestStress ? `${latestStress.iterations}×` : "—",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border px-4 py-3.5 shadow-sm"
            style={{
              backgroundColor: palette.cardBg,
              borderColor: palette.cardBorder,
            }}
          >
            <p
              className="text-[11px] font-medium uppercase tracking-wider"
              style={{ color: palette.tickMuted }}
            >
              {card.label}
            </p>
            <p
              className="mt-1 text-2xl font-semibold tabular-nums tracking-tight"
              style={{ color: palette.tooltipFg }}
            >
              {card.value}
            </p>
            <p className="mt-0.5 text-[11px]" style={{ color: palette.tickMuted }}>
              {card.sub}
            </p>
          </div>
        ))}
      </div>

      {hasLatency ? (
        <div
          className="rounded-xl border p-4 shadow-sm sm:p-5"
          style={{
            backgroundColor: palette.sectionBg,
            borderColor: palette.cardBorder,
          }}
        >
          <div className="mb-4">
            <h3
              className="text-sm font-semibold tracking-tight"
              style={{ color: palette.tooltipFg }}
            >
              Latency by node
            </h3>
            <p className="mt-1 text-xs" style={{ color: palette.tickMuted }}>
              {latestStress
                ? "From the latest stress run: average, min, and max milliseconds."
                : "From the last completed run on each block."}
            </p>
          </div>
          <div className="h-[240px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={latencyRows}
                margin={{ top: 12, right: 12, left: 4, bottom: 8 }}
              >
                <CartesianGrid
                  stroke={palette.grid}
                  strokeDasharray="4 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{
                    fill: palette.tick,
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                  tickLine={{ stroke: palette.axisLine }}
                  axisLine={{ stroke: palette.axisLine }}
                  interval={0}
                  angle={-22}
                  textAnchor="end"
                  height={62}
                />
                <YAxis
                  tick={{
                    fill: palette.tickMuted,
                    fontSize: 11,
                  }}
                  tickLine={false}
                  axisLine={{ stroke: palette.axisLine }}
                  width={44}
                  label={{
                    value: "ms",
                    angle: -90,
                    position: "insideLeft",
                    fill: palette.tickMuted,
                    fontSize: 11,
                    offset: 8,
                  }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => {
                    const v =
                      typeof value === "number"
                        ? `${value} ms`
                        : String(value ?? "")
                    const label =
                      name === "avgMs"
                        ? "Average"
                        : name === "minMs"
                          ? "Min"
                          : name === "maxMs"
                            ? "Max"
                            : String(name)
                    return [v, label]
                  }}
                />
                <Legend wrapperStyle={legendStyle} />
                <Bar
                  dataKey="avgMs"
                  name="Avg"
                  fill={palette.barAvg}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
                {latestStress ? (
                  <>
                    <Bar
                      dataKey="minMs"
                      name="Min"
                      fill={palette.barMin}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                    />
                    <Bar
                      dataKey="maxMs"
                      name="Max"
                      fill={palette.barMax}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                    />
                  </>
                ) : null}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {hasPie ? (
        <div
          className="rounded-xl border p-4 shadow-sm sm:p-5"
          style={{
            backgroundColor: palette.sectionBg,
            borderColor: palette.cardBorder,
          }}
        >
          <div className="mb-2">
            <h3
              className="text-sm font-semibold tracking-tight"
              style={{ color: palette.tooltipFg }}
            >
              Outcomes
            </h3>
            <p className="mt-1 text-xs" style={{ color: palette.tickMuted }}>
              Success vs failed requests in the last 120 log lines.
            </p>
          </div>
          <div className="mx-auto h-[220px] w-full max-w-[280px] sm:mx-0 sm:max-w-xs">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieDisplay}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={82}
                  paddingAngle={3}
                  stroke={palette.pieStroke}
                  strokeWidth={1}
                >
                  {pieDisplay.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={
                        entry.key === "ok" ? palette.pieOk : palette.pieBad
                      }
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend
                  verticalAlign="bottom"
                  wrapperStyle={{
                    ...legendStyle,
                    paddingTop: 16,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
