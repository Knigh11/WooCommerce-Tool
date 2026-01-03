import { Loader2 } from "lucide-react"
import { cn } from "../../lib/utils"

interface InlineLoaderProps {
  size?: number
  className?: string
  text?: string
}

export function InlineLoader({ size = 16, className, text }: InlineLoaderProps) {
  return (
    <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
      <Loader2 className="animate-spin" size={size} />
      {text && <span className="text-sm">{text}</span>}
    </div>
  )
}

