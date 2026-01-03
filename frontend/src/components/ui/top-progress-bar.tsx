import { cn } from "../../lib/utils"

interface TopProgressBarProps {
  active: boolean
  className?: string
}

export function TopProgressBar({ active, className }: TopProgressBarProps) {
  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-50 h-1 bg-transparent transition-opacity duration-200",
        active ? "opacity-100" : "opacity-0 pointer-events-none",
        className
      )}
    >
      <div
        className="h-full bg-primary relative overflow-hidden"
        style={{
          width: "100%",
        }}
      >
        <div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          style={{
            width: "50%",
            animation: active ? "progress 1.5s ease-in-out infinite" : "none",
            transform: "translateX(-100%)",
          }}
        />
      </div>
    </div>
  )
}

