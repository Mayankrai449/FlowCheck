import { type ComponentProps } from "react"
import { cn } from "@/lib/utils"

export function Skeleton({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted/80 dark:bg-zinc-800/90",
        className,
      )}
      {...props}
    />
  )
}
