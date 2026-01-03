import { cn } from "../../lib/utils"

// Base skeleton with shimmer animation
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

// Shimmer effect for skeleton
export function SkeletonShimmer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent",
        className
      )}
      {...props}
    />
  )
}

// Line skeleton (for text)
export function SkeletonLine({ className, width = "100%" }: { className?: string; width?: string | number }) {
  return (
    <SkeletonShimmer
      className={cn("h-4", className)}
      style={{ width: typeof width === "number" ? `${width}px` : width }}
    />
  )
}

// Avatar skeleton (for images)
export function SkeletonAvatar({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <SkeletonShimmer
      className={cn("rounded-full", className)}
      style={{ width: size, height: size }}
    />
  )
}

// Table skeleton
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-4 border-b pb-2">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={i} width="25%" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex gap-4 py-3">
          {Array.from({ length: cols }).map((_, colIdx) => (
            <SkeletonLine
              key={colIdx}
              width={colIdx === 0 ? "30%" : "20%"}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// Form skeleton (for modals)
export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <SkeletonLine width="20%" />
          <SkeletonLine width="100%" />
        </div>
      ))}
    </div>
  )
}

