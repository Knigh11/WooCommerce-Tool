import { X } from "lucide-react"
import { Button } from "../ui/button"

interface ErrorBannerProps {
  error: string | null
  onDismiss?: () => void
}

export function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {

  if (!error) return null

  return (
    <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-4 mb-4 flex items-center justify-between">
      <span>{error}</span>
      {onDismiss && (
        <Button variant="ghost" size="icon" onClick={onDismiss}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

