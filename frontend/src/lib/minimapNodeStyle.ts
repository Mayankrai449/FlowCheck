import type { Node } from "@xyflow/react"
import type { AppNode } from "@/types/flow"

/**
 * MiniMap renders SVG rects; CSS variables often fail to resolve on `fill` here.
 * Use explicit colors keyed off the same theme + HTTP method as ApiNode badges.
 */
export function minimapNodeFill(node: Node, theme: "light" | "dark"): string {
  const baseLight = "#ffffff"
  const baseDark = "oklch(0.26 0 0)"

  if (node.type !== "api") {
    return theme === "dark" ? baseDark : baseLight
  }

  const m = String((node as AppNode).data?.method ?? "GET").toUpperCase()

  if (theme === "dark") {
    if (m === "GET")
      return "color-mix(in oklab, oklch(0.58 0.14 255) 38%, oklch(0.23 0 0))"
    if (m === "POST")
      return "color-mix(in oklab, oklch(0.58 0.16 155) 38%, oklch(0.23 0 0))"
    if (m === "PUT" || m === "PATCH")
      return "color-mix(in oklab, oklch(0.6 0.14 75) 38%, oklch(0.23 0 0))"
    if (m === "DELETE")
      return "color-mix(in oklab, oklch(0.58 0.18 25) 38%, oklch(0.23 0 0))"
    return baseDark
  }

  if (m === "GET")
    return "color-mix(in oklab, oklch(0.72 0.11 255) 24%, white)"
  if (m === "POST")
    return "color-mix(in oklab, oklch(0.75 0.12 155) 24%, white)"
  if (m === "PUT" || m === "PATCH")
    return "color-mix(in oklab, oklch(0.78 0.11 75) 22%, white)"
  if (m === "DELETE")
    return "color-mix(in oklab, oklch(0.76 0.12 25) 24%, white)"
  return baseLight
}

export function minimapNodeStroke(theme: "light" | "dark"): string {
  return theme === "dark" ? "oklch(1 0 0 / 30%)" : "oklch(0 0 0 / 14%)"
}

export function minimapPanelBg(theme: "light" | "dark"): string {
  return theme === "dark" ? "oklch(0.22 0 0)" : "oklch(0.98 0 0)"
}
