import * as dagre from "@dagrejs/dagre"
import type { Edge } from "@xyflow/react"
import type { AppNode } from "@/types/flow"

/** Approximate RF node footprint (matches ~280px-wide cards). */
const NODE_W = 300
const NODE_H = 112

/**
 * Layered DAG layout (TB). Validates acyclic graph via caller if needed.
 */
export function layoutNodesWithDagre(
  nodes: AppNode[],
  edges: Edge[],
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph({ multigraph: false })
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: "TB",
    align: "UL",
    nodesep: 72,
    ranksep: 100,
    marginx: 56,
    marginy: 56,
    edgesep: 36,
  })

  const ids = new Set(nodes.map((n) => n.id))
  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_W, height: NODE_H })
  }
  for (const e of edges) {
    if (ids.has(e.source) && ids.has(e.target)) {
      g.setEdge(e.source, e.target)
    }
  }

  dagre.layout(g)

  const out = new Map<string, { x: number; y: number }>()
  for (const n of nodes) {
    const pos = g.node(n.id) as { x: number; y: number } | undefined
    if (pos) {
      out.set(n.id, {
        x: pos.x - NODE_W / 2,
        y: pos.y - NODE_H / 2,
      })
    }
  }
  return out
}
