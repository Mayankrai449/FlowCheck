import type { ExecuteFlowResult } from "@/lib/executeFlow"
import type { AppNode } from "@/types/flow"
import type { NodeStressStats, StressSummary } from "@/types/workflow"

export function buildStressSummary(
  iterations: number,
  rounds: ExecuteFlowResult[][],
  nodes: AppNode[],
): StressSummary {
  const perNode: Record<string, NodeStressStats> = {}

  for (const n of nodes) {
    let samples = 0
    let successes = 0
    let fails = 0
    let minMs = Number.POSITIVE_INFINITY
    let maxMs = 0
    let sumMs = 0

    for (const round of rounds) {
      const r = round.find((x) => x.nodeId === n.id)
      if (!r) continue
      samples += 1
      const ok =
        !r.error && (r.statusCode === null || r.statusCode < 400)
      if (ok) successes += 1
      else fails += 1
      minMs = Math.min(minMs, r.durationMs)
      maxMs = Math.max(maxMs, r.durationMs)
      sumMs += r.durationMs
    }

    perNode[n.id] = {
      samples,
      successes,
      fails,
      minMs: samples ? minMs : 0,
      maxMs: samples ? maxMs : 0,
      avgMs: samples ? sumMs / samples : 0,
    }
  }

  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    iterations,
    perNode,
  }
}
