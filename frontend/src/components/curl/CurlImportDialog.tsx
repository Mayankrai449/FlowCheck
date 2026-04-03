import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { parseCurl } from "@/lib/parseCurl"
import { useWorkflowStore } from "@/store/workflowStore"

export function CurlImportDialog() {
  const curlTargetNodeId = useWorkflowStore((s) => s.curlTargetNodeId)
  const setCurlTarget = useWorkflowStore((s) => s.setCurlTarget)
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData)
  const [raw, setRaw] = useState("")
  const [error, setError] = useState<string | null>(null)

  const open = curlTargetNodeId != null

  useEffect(() => {
    if (open) {
      setRaw("")
      setError(null)
    }
  }, [open, curlTargetNodeId])

  const close = () => {
    setCurlTarget(null)
    setError(null)
  }

  const apply = () => {
    if (!curlTargetNodeId) return
    try {
      const p = parseCurl(raw)
      updateNodeData(curlTargetNodeId, {
        method: p.method,
        url: p.url,
        headers: p.headers,
        body: p.body,
        runStatus: "idle",
      })
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse cURL")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import cURL</DialogTitle>
          <DialogDescription>
            Paste a cURL command to set method, URL, headers, and body on this
            block.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value)
            setError(null)
          }}
          placeholder={`curl -X POST https://api.example.com/v1/items \\
  -H "Content-Type: application/json" \\
  -d '{"name":"demo"}'`}
          className="min-h-[140px] font-mono text-xs"
        />
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="button" onClick={apply}>
            Parse & apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
