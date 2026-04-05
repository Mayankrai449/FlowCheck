import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

const STORAGE_KEY = "flowcheck-theme"

function subscribeSystemTheme(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)")
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}

function getSystemIsDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function readExplicit(): "light" | "dark" | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === "light" || v === "dark") return v
  } catch {
    /* ignore */
  }
  return null
}

type ThemeContextValue = {
  resolvedTheme: "light" | "dark"
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemIsDark = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemIsDark,
    () => false,
  )
  const [explicit, setExplicit] = useState<"light" | "dark" | null>(() =>
    readExplicit(),
  )

  const resolvedTheme: "light" | "dark" =
    explicit ?? (systemIsDark ? "dark" : "light")

  useEffect(() => {
    document.documentElement.classList.toggle(
      "dark",
      resolvedTheme === "dark",
    )
  }, [resolvedTheme])

  useEffect(() => {
    if (explicit === null) return
    try {
      localStorage.setItem(STORAGE_KEY, explicit)
    } catch {
      /* ignore */
    }
  }, [explicit])

  const toggleTheme = useCallback(() => {
    setExplicit(resolvedTheme === "light" ? "dark" : "light")
  }, [resolvedTheme])

  const value = useMemo(
    () => ({ resolvedTheme, toggleTheme }),
    [resolvedTheme, toggleTheme],
  )

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return ctx
}
