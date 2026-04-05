import type { Edge } from "@xyflow/react"
import type { AppNode } from "@/types/flow"

export type ExecutionPlan =
  | { ok: true; batches: string[][] }
  | { ok: false; message: string }

/**
 * Same scheduling as the FlowCheck backend: each batch is one parallel wave
 * (nodes whose predecessors are all completed).
 */
export function buildExecutionPlan(
  nodes: AppNode[],
  edges: Pick<Edge, "source" | "target">[],
): ExecutionPlan {
  const ids = new Set(nodes.map((n) => n.id))
  if (ids.size === 0) {
    return { ok: false, message: "Add at least one block." }
  }

  const preds: Record<string, Set<string>> = {}
  for (const id of ids) preds[id] = new Set()

  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue
    preds[e.target].add(e.source)
  }

  const completed = new Set<string>()
  const batches: string[][] = []

  while (completed.size < ids.size) {
    const ready = [...ids].filter(
      (id) =>
        !completed.has(id) && [...preds[id]].every((p) => completed.has(p)),
    )
    if (ready.length === 0) {
      return {
        ok: false,
        message:
          "This graph has a cycle or invalid links. Use a DAG (no cycles).",
      }
    }
    batches.push(ready)
    for (const id of ready) completed.add(id)
  }

  return { ok: true, batches }
}

export function slugifyFilename(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
  return s || "workflow"
}
