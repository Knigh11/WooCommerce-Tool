/**
 * Parse product URLs from text input
 * Supports newline, comma, or space separation
 * Trims whitespace, removes empty strings, and deduplicates
 */
export function parseProductUrls(input: string): string[] {
  if (!input || !input.trim()) return []
  
  return Array.from(
    new Set(
      input
        .split(/[,\n\s]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    )
  )
}

/**
 * Parse product IDs from text input
 * Supports newline, comma, or space separation
 * Trims whitespace, removes empty strings, and deduplicates
 * Filters out non-numeric values
 */
export function parseProductIds(input: string): number[] {
  if (!input || !input.trim()) return []
  
  return Array.from(
    new Set(
      input
        .split(/[,\n\s]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => parseInt(s, 10))
        .filter((n) => !isNaN(n))
    )
  )
}

