import {
  Braces,
  ChevronDown,
  GitBranch,
  Globe,
  Zap,
} from "lucide-react"
import type { ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  selectActiveWorkflow,
  useWorkflowStore,
} from "@/store/workflowStore"
import type { AppNode } from "@/types/flow"

function parseHeaderLines(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split("\n")) {
    const t = line.trim()
    if (!t) continue
    const i = t.indexOf(":")
    if (i <= 0) continue
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim()
    if (k) out[k] = v
  }
  return out
}

function headersToText(h: Record<string, string>): string {
  return Object.entries(h)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")
}

function nodeIcon(n: AppNode) {
  switch (n.type) {
    case "http":
      return <Globe className="size-4 text-sky-400" />
    case "condition":
      return <GitBranch className="size-4 text-violet-400" />
    case "code":
      return <Braces className="size-4 text-emerald-400" />
    case "trigger":
      return <Zap className="size-4 text-amber-400" />
    default: {
      const _e: never = n
      return _e
    }
  }
}

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90"
const controlSurface =
  "rounded-xl border border-white/10 bg-white/[0.04] shadow-inner transition-colors focus-within:border-indigo-400/35 dark:border-white/[0.08] dark:bg-white/[0.03]"
const selectSurface = cn(
  "flex h-9 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm shadow-inner outline-none transition-colors",
  "focus-visible:border-indigo-400/45 focus-visible:ring-2 focus-visible:ring-indigo-400/20",
  "dark:border-white/[0.08] dark:bg-white/[0.03]",
)

function InspectorSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-white/10 bg-slate-950/25 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]"
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5",
          "text-xs font-semibold tracking-wide text-foreground/95",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        {title}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground opacity-60 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-white/10 px-3 py-3 dark:border-white/[0.06]">
        {children}
      </div>
    </details>
  )
}

export function NodeInspector() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const wf = useWorkflowStore(selectActiveWorkflow)
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData)
  const node = wf?.nodes.find((n) => n.id === selectedNodeId)

  if (!node) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center dark:border-white/[0.07]">
        <div className="rounded-full bg-muted/50 p-3 text-muted-foreground">
          <GitBranch className="size-6 opacity-50" />
        </div>
        <p className="max-w-[14rem] text-sm leading-relaxed text-muted-foreground">
          Select a node on the canvas to edit labels, requests, and error
          handling.
        </p>
      </div>
    )
  }

  const icon = nodeIcon(node)

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-transparent to-violet-500/10 p-3 dark:border-white/[0.07]">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-card/80 shadow-sm dark:border-white/[0.08]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/90">
            Inspector
          </p>
          <p className="truncate text-sm font-semibold text-foreground">
            {node.data.label || node.type}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {node.type} · {node.id.slice(0, 8)}…
          </p>
        </div>
      </div>

      <InspectorSection title="Basic" defaultOpen>
        <div className="space-y-1.5">
          <label htmlFor="fc-label" className={fieldLabel}>
            Label
          </label>
          <Input
            id="fc-label"
            value={node.data.label}
            onChange={(e) =>
              updateNodeData(node.id, { label: e.target.value })
            }
            className={cn("h-9 text-sm", controlSurface)}
          />
        </div>

        {node.type === "http" ? (
          <>
            <div className="space-y-1.5">
              <label htmlFor="fc-method" className={fieldLabel}>
                Method
              </label>
              <select
                id="fc-method"
                className={selectSurface}
                value={node.data.method.toUpperCase()}
                onChange={(e) =>
                  updateNodeData(node.id, { method: e.target.value })
                }
              >
                {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="fc-url" className={fieldLabel}>
                URL
              </label>
              <Input
                id="fc-url"
                value={node.data.url}
                onChange={(e) =>
                  updateNodeData(node.id, { url: e.target.value })
                }
                className={cn("h-9 font-mono text-xs", controlSurface)}
              />
            </div>
          </>
        ) : null}

        {node.type === "condition" ? (
          <div className="space-y-1.5">
            <label htmlFor="fc-eval" className={fieldLabel}>
              Evaluation mode
            </label>
            <select
              id="fc-eval"
              className={selectSurface}
              value={node.data.evalMode}
              onChange={(e) =>
                updateNodeData(node.id, {
                  evalMode: e.target.value as typeof node.data.evalMode,
                })
              }
            >
              <option value="safe_expr">
                Safe expression (ctx only, no calls)
              </option>
              <option value="python_sandbox">
                Python block (set variable result)
              </option>
            </select>
          </div>
        ) : null}

        {node.type === "code" ? (
          <div className="space-y-1.5">
            <label htmlFor="fc-timeout" className={fieldLabel}>
              Timeout (seconds)
            </label>
            <Input
              id="fc-timeout"
              type="number"
              min={0.5}
              max={30}
              step={0.5}
              value={node.data.timeoutS}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (!Number.isFinite(v)) return
                updateNodeData(node.id, {
                  timeoutS: Math.min(30, Math.max(0.5, v)),
                })
              }}
              className={cn("h-9 text-sm", controlSurface)}
            />
          </div>
        ) : null}
      </InspectorSection>

      {node.type === "http" ? (
        <>
          <InspectorSection title="Headers">
            <div className="space-y-1.5">
              <label htmlFor="fc-headers" className={fieldLabel}>
                One per line (Name: value)
              </label>
              <Textarea
                id="fc-headers"
                value={headersToText(node.data.headers)}
                onChange={(e) =>
                  updateNodeData(node.id, {
                    headers: parseHeaderLines(e.target.value),
                  })
                }
                className={cn("min-h-[88px] font-mono text-xs", controlSurface)}
                spellCheck={false}
              />
            </div>
          </InspectorSection>

          <InspectorSection title="Body">
            <div className="space-y-1.5">
              <label htmlFor="fc-body" className={fieldLabel}>
                Request body
              </label>
              <Textarea
                id="fc-body"
                value={node.data.body ?? ""}
                onChange={(e) =>
                  updateNodeData(node.id, {
                    body: e.target.value === "" ? null : e.target.value,
                  })
                }
                className={cn("min-h-[100px] font-mono text-xs", controlSurface)}
                spellCheck={false}
              />
            </div>
          </InspectorSection>

          <InspectorSection title="Error handling">
            <div className="space-y-3">
              <div className="space-y-1">
                <label
                  htmlFor="fc-max-retries"
                  className="text-xs text-muted-foreground"
                >
                  Max retries (after first attempt)
                </label>
                <Input
                  id="fc-max-retries"
                  type="number"
                  min={0}
                  max={50}
                  className={cn("h-9 text-sm", controlSurface)}
                  value={node.data.retryConfig?.maxRetries ?? 0}
                  onChange={(e) => {
                    const v = Math.min(
                      50,
                      Math.max(0, Math.floor(Number(e.target.value) || 0)),
                    )
                    updateNodeData(node.id, {
                      retryConfig: {
                        maxRetries: v,
                        delayMs: node.data.retryConfig?.delayMs ?? 1000,
                        useExponentialBackoff:
                          node.data.retryConfig?.useExponentialBackoff ??
                          false,
                      },
                    })
                  }}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="fc-retry-delay"
                  className="text-xs text-muted-foreground"
                >
                  Delay between retries (ms)
                </label>
                <Input
                  id="fc-retry-delay"
                  type="number"
                  min={0}
                  max={600000}
                  step={100}
                  className={cn("h-9 text-sm", controlSurface)}
                  value={node.data.retryConfig?.delayMs ?? 1000}
                  onChange={(e) => {
                    const v = Math.min(
                      600_000,
                      Math.max(0, Math.floor(Number(e.target.value) || 0)),
                    )
                    updateNodeData(node.id, {
                      retryConfig: {
                        maxRetries: node.data.retryConfig?.maxRetries ?? 0,
                        delayMs: v,
                        useExponentialBackoff:
                          node.data.retryConfig?.useExponentialBackoff ??
                          false,
                      },
                    })
                  }}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 rounded border-white/20 bg-white/5 accent-indigo-500"
                  checked={
                    node.data.retryConfig?.useExponentialBackoff ?? false
                  }
                  onChange={(e) =>
                    updateNodeData(node.id, {
                      retryConfig: {
                        maxRetries: node.data.retryConfig?.maxRetries ?? 0,
                        delayMs: node.data.retryConfig?.delayMs ?? 1000,
                        useExponentialBackoff: e.target.checked,
                      },
                    })
                  }
                />
                Exponential backoff
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 rounded border-white/20 bg-white/5 accent-indigo-500"
                  checked={node.data.continueOnFail === true}
                  onChange={(e) =>
                    updateNodeData(node.id, {
                      continueOnFail: e.target.checked,
                    })
                  }
                />
                Continue workflow if this block fails
              </label>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Retries run in the browser before the next workflow step. The
                backend sees one clean request per attempt.
              </p>
            </div>
          </InspectorSection>

          <InspectorSection title="Advanced">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              After upstream blocks run, inject outputs with templates such as{" "}
              <span className="break-all font-mono text-[10px] text-indigo-200/90">
                {`{{ $node["PASTE_NODE_ID"].data.response_preview }}`}
              </span>{" "}
              (also{" "}
              <span className="font-mono text-[10px] text-indigo-200/90">
                status_code
              </span>
              ,{" "}
              <span className="font-mono text-[10px] text-indigo-200/90">
                statusCode
              </span>
              ).
            </p>
          </InspectorSection>
        </>
      ) : null}

      {node.type === "condition" ? (
        <InspectorSection title="Logic" defaultOpen>
          <div className="space-y-1.5">
            <label htmlFor="fc-expr" className={fieldLabel}>
              {node.data.evalMode === "python_sandbox"
                ? "Python (assign to result)"
                : "Expression"}
            </label>
            <Textarea
              id="fc-expr"
              value={node.data.expression}
              onChange={(e) =>
                updateNodeData(node.id, { expression: e.target.value })
              }
              className={cn("min-h-[120px] font-mono text-xs", controlSurface)}
              spellCheck={false}
              placeholder={
                node.data.evalMode === "python_sandbox"
                  ? 'result = ctx["node-id"].get("status_code") == 200'
                  : 'ctx["node-id"]["status_code"] < 400'
              }
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Upstream outputs are in{" "}
              <span className="font-mono text-[10px] text-foreground/80">
                ctx[node_id]
              </span>{" "}
              (HTTP nodes expose{" "}
              <span className="font-mono text-[10px]">status_code</span>,{" "}
              <span className="font-mono text-[10px]">response_preview</span>,{" "}
              <span className="font-mono text-[10px]">error</span>).
            </p>
          </div>
        </InspectorSection>
      ) : null}

      {node.type === "code" ? (
        <InspectorSection title="Code" defaultOpen>
          <div className="space-y-1.5">
            <label htmlFor="fc-code" className={fieldLabel}>
              Python
            </label>
            <Textarea
              id="fc-code"
              value={node.data.code}
              onChange={(e) =>
                updateNodeData(node.id, { code: e.target.value })
              }
              className={cn("min-h-[160px] font-mono text-xs", controlSurface)}
              spellCheck={false}
              placeholder='result = {"echo": len(str(ctx))}'
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Runs with restricted builtins. Read{" "}
              <span className="font-mono text-[10px]">ctx</span>, write{" "}
              <span className="font-mono text-[10px]">result</span> for the
              response preview.
            </p>
          </div>
        </InspectorSection>
      ) : null}

      {node.type === "trigger" ? (
        <InspectorSection title="Notes" defaultOpen>
          <div className="space-y-1.5">
            <label htmlFor="fc-note" className={fieldLabel}>
              Note
            </label>
            <Textarea
              id="fc-note"
              value={node.data.note}
              onChange={(e) =>
                updateNodeData(node.id, { note: e.target.value })
              }
              className={cn("min-h-[80px] text-sm", controlSurface)}
              placeholder="Optional description"
            />
          </div>
        </InspectorSection>
      ) : null}
    </div>
  )
}
