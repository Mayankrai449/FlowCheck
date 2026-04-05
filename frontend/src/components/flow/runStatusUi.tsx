import type { HttpNodeData } from "@/types/flow"

type RunSlice = Pick<
  HttpNodeData,
  "runStatus" | "lastStatusCode"
>

export function runStatusPill(data: RunSlice): { label: string; className: string } {
  switch (data.runStatus) {
    case "running":
      return {
        label: "Running",
        className:
          "border-indigo-400/45 bg-indigo-500/20 text-indigo-950 shadow-[0_0_12px_-2px_rgba(99,102,241,0.5)] animate-pulse dark:border-indigo-400/55 dark:bg-indigo-500/25 dark:text-indigo-50",
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
        label:
          data.lastStatusCode != null
            ? `Fail · ${data.lastStatusCode}`
            : "Fail",
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
