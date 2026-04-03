export type ParsedCurl = {
  method: string
  url: string
  headers: Record<string, string>
  body: string | null
}

/** Unwrap one pair of surrounding quotes */
function stripWrappingQuotes(s: string): string {
  const t = s.trim()
  if (t.length >= 2) {
    const a = t[0]
    const b = t[t.length - 1]
    if ((a === "'" && b === "'") || (a === '"' && b === '"')) {
      return t.slice(1, -1)
    }
  }
  return t
}

/** Tokenize curl-like command respecting single and double quotes */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let i = 0
  let current = ""
  let quote: "'" | '"' | null = null

  const push = () => {
    if (current.length) tokens.push(current)
    current = ""
  }

  while (i < input.length) {
    const c = input[i]!

    if (quote) {
      if (c === quote) {
        quote = null
        i++
        continue
      }
      current += c
      i++
      continue
    }

    if (c === "'" || c === '"') {
      quote = c
      i++
      continue
    }

    if (/\s/.test(c)) {
      push()
      i++
      continue
    }

    current += c
    i++
  }
  push()
  return tokens.filter((tok) => tok !== "\\")
}

function looksLikeUrl(s: string): boolean {
  const u = stripWrappingQuotes(s)
  return /^https?:\/\//i.test(u)
}

/** Flags that consume the next token but are not HTTP semantics we model */
const SKIP_WITH_ARG = new Set([
  "-o",
  "--output",
  "-w",
  "--write-out",
  "-b",
  "--cookie",
  "-c",
  "--cookie-jar",
  "-D",
  "--dump-header",
  "-e",
  "--referer",
  "-u",
  "--user",
])

/** Long-only skip flags */
const SKIP_WITH_ARG_LONG = new Set([
  "--data-urlencode",
  "--proxy-user",
  "--max-time",
  "--connect-timeout",
  "--retry",
])

/** No-argument flags to skip */
const SKIP_NO_ARG = new Set([
  "--compressed",
  "-k",
  "--insecure",
  "-L",
  "--location",
  "-s",
  "--silent",
  "-S",
  "--show-error",
  "-v",
  "--verbose",
  "-i",
  "--include",
])

export function parseCurl(raw: string): ParsedCurl {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error("Empty input")

  let line = trimmed.replace(/\\\r?\n/g, " ").replace(/\\\n/g, " ")
  if (/^curl\b/i.test(line)) {
    line = line.replace(/^curl\b/i, "").trim()
  }

  const tokens = tokenize(line)
  const headers: Record<string, string> = {}
  let method = "GET"
  let explicitMethod = false
  let forceGet = false
  let url = ""
  let body: string | null = null

  const takeArg = (t: number): [string | undefined, number] => {
    const next = tokens[t + 1]
    return [next, t + 1]
  }

  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t]!
    const low = tok.toLowerCase()

    if (low === "#") break

    if (SKIP_NO_ARG.has(low)) continue

    if (tok === "-x" || low === "--proxy") {
      t++
      continue
    }

    if (SKIP_WITH_ARG.has(low) || SKIP_WITH_ARG_LONG.has(low)) {
      t++
      continue
    }

    if (low === "--url") {
      const [u, nt] = takeArg(t)
      if (u) url = stripWrappingQuotes(u)
      t = nt
      continue
    }

    if (tok === "-G" || low === "--get") {
      forceGet = true
      continue
    }

    if (tok === "-X" || low === "--request") {
      const [m, nt] = takeArg(t)
      if (!m) throw new Error("Missing value for method")
      method = stripWrappingQuotes(m).toUpperCase()
      explicitMethod = true
      t = nt
      continue
    }

    if (low === "-h" || low === "--header") {
      const [hRaw, nt] = takeArg(t)
      if (!hRaw) throw new Error("Missing header value")
      const h = stripWrappingQuotes(hRaw)
      const colon = h.indexOf(":")
      if (colon === -1) {
        t = nt
        continue
      }
      const name = h.slice(0, colon).trim()
      const value = h.slice(colon + 1).trim()
      if (name) headers[name] = value
      t = nt
      continue
    }

    if (
      low === "-d" ||
      low === "--data" ||
      low === "--data-raw" ||
      low === "--data-binary"
    ) {
      const [d, nt] = takeArg(t)
      if (d === undefined) throw new Error("Missing body for data flag")
      body = stripWrappingQuotes(d)
      if (!explicitMethod) method = "POST"
      t = nt
      continue
    }

    if (looksLikeUrl(tok)) {
      url = stripWrappingQuotes(tok)
      continue
    }

    // --header=Foo: bar style
    const eqHeader = /^--header=(.+)$/i.exec(tok)
    if (eqHeader) {
      const h = stripWrappingQuotes(eqHeader[1]!)
      const colon = h.indexOf(":")
      if (colon !== -1) {
        const name = h.slice(0, colon).trim()
        const value = h.slice(colon + 1).trim()
        if (name) headers[name] = value
      }
      continue
    }
  }

  if (forceGet) {
    method = "GET"
  }

  if (!url) throw new Error("Could not find URL in cURL string")

  return { method, url, headers, body }
}
