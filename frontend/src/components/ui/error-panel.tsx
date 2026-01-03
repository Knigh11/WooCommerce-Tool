import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "./button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card"

interface ErrorPanelProps {
  title?: string
  message?: string
  onRetry?: () => void
  className?: string
}

export function ErrorPanel({
  title = "Something went wrong",
  message = "An error occurred while loading data. Please try again.",
  onRetry,
  className,
}: ErrorPanelProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      {onRetry && (
        <CardContent>
          <Button onClick={onRetry} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      )}
    </Card>
  )
}

