import { cn } from "@/lib/utils"
import type { RunStatus } from "@/types/flow"

export function flowNodeSurfaceClass(opts: {
  selected: boolean
  runStatus: RunStatus
  /** e.g. w-[260px] for trigger */
  widthClass?: string
  /** Match canvas node width cap */
  maxPx?: 260 | 280
}): string {
  const w = opts.widthClass ?? "w-[280px]"
  const cap = opts.maxPx ?? 280
  const maxW =
    cap === 260 ? "max-w-[min(260px,100%)]" : "max-w-[min(280px,100%)]"
  return cn(
    `${w} min-w-0 overflow-hidden rounded-xl border ${maxW}`,
    "border-white/10 bg-gradient-to-b from-card/95 to-card/85 shadow-lg backdrop-blur-md",
    "transition-all duration-300 ease-out",
    "hover:border-white/[0.16] hover:shadow-2xl dark:from-slate-900/92 dark:to-slate-950/88",
    opts.selected &&
      "border-indigo-400/45 ring-2 ring-indigo-400/25 shadow-[0_0_32px_-8px_rgba(99,102,241,0.48)]",
    opts.runStatus === "success" &&
      "border-emerald-500/40 shadow-[0_8px_30px_-10px_rgba(16,185,129,0.25)]",
    opts.runStatus === "fail" &&
      "border-red-500/45 shadow-[0_8px_30px_-10px_rgba(239,68,68,0.22)]",
    opts.runStatus === "running" &&
      "animate-[fc-node-running_2s_ease-in-out_infinite] border-indigo-400/35",
  )
}

export const flowHandleClass =
  "!size-3 !border-2 !border-slate-800/90 !bg-gradient-to-b !from-blue-400 !to-indigo-600 !shadow-md !transition-transform hover:!scale-125 dark:!border-slate-950/90"
