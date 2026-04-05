import type { FlowExecutionContext } from "@/types/flow"

function getByPath(obj: Record<string, unknown>, parts: string[]): unknown {
  let cur: unknown = obj
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint")
    return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/**
 * Replace `{{ $node["<id>"].data.a.b }}` or `{{ $node.<id>.data.a.b }}`
 * using the current execution context (no eval).
 */
export function resolveTemplate(
  str: string,
  context: FlowExecutionContext,
): string {
  if (!str.includes("{{")) return str

  const replaceBracket = (_m: string, nodeId: string, path: string): string => {
    const entry = context[nodeId]
    const data =
      entry && typeof entry === "object" && "data" in entry
        ? (entry as { data: Record<string, unknown> }).data
        : undefined
    if (!data || typeof data !== "object") return ""
    const v = getByPath(data, path.split(".").filter(Boolean))
    return stringifyValue(v)
  }

  let out = str.replace(
    /\{\{\s*\$node\["([^"]+)"\]\.data\.([a-zA-Z0-9_.]+)\s*\}\}/g,
    replaceBracket,
  )

  out = out.replace(
    /\{\{\s*\$node\.([a-zA-Z0-9-]+)\.data\.([a-zA-Z0-9_.]+)\s*\}\}/g,
    replaceBracket,
  )

  return out
}
