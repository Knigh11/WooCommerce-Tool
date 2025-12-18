import { memo, useEffect, useRef } from "react"
import { SSELogEvent } from "../../api/types"
import { Button } from "../ui/button"
import { useTranslation } from "react-i18next"
import { Copy, Trash2 } from "lucide-react"

interface JobLogConsoleProps {
  logs: SSELogEvent[]
  autoScroll: boolean
  onToggleAutoScroll: () => void
  onClear?: () => void
}

export const JobLogConsole = memo(function JobLogConsole({
  logs,
  autoScroll,
  onToggleAutoScroll,
  onClear,
}: JobLogConsoleProps) {
  const { t } = useTranslation()
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [logs, autoScroll])

  const handleCopyLogs = () => {
    const logText = logs
      .map(
        (log) =>
          `[${log.ts}] [${log.level}]${log.product_id ? ` [Product ${log.product_id}]` : ""} ${log.msg}`
      )
      .join("\n")
    navigator.clipboard.writeText(logText)
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-muted p-2 flex justify-between items-center">
        <h4 className="font-medium text-sm">
          {t("job.logs")} ({logs.length})
        </h4>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyLogs}
            disabled={logs.length === 0}
          >
            <Copy className="h-4 w-4 mr-1" />
            {t("job.copyLogs")}
          </Button>
          {onClear && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={logs.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {t("job.clearView")}
            </Button>
          )}
          <label className="flex items-center text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={onToggleAutoScroll}
              className="mr-2"
            />
            {t("job.autoScroll")}
          </label>
        </div>
      </div>
      <div className="h-64 overflow-y-auto p-2 font-mono text-xs bg-background border-t">
        {logs.length === 0 ? (
          <div className="text-muted-foreground">No logs yet...</div>
        ) : (
          logs.map((log, idx) => (
            <div key={idx} className="mb-1">
              <span className="text-muted-foreground">[{log.ts}]</span>{" "}
              <span
                className={
                  log.level === "ERROR"
                    ? "text-destructive"
                    : log.level === "WARN"
                    ? "text-yellow-500"
                    : log.level === "SUCCESS"
                    ? "text-green-500"
                    : "text-foreground"
                }
              >
                [{log.level}]
              </span>
              {log.product_id && (
                <>
                  {" "}
                  <span className="text-blue-500">
                    [Product {log.product_id}]
                  </span>
                </>
              )}{" "}
              <span>{log.msg}</span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  )
})

