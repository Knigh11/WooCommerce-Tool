/**
 * Normalize XML filename to ensure it ends with exactly ".xml"
 * and removes trailing invalid characters.
 * 
 * Chrome may add underscores or modify filenames if they contain
 * invalid characters or patterns. This function ensures clean filenames.
 */
export function normalizeXmlFilename(filename: string): string {
  if (!filename) {
    return "feed.xml"
  }

  // Remove any leading/trailing whitespace
  let normalized = filename.trim()

  // Check if it ends with .xml (case-insensitive) and extract base name
  const xmlExtMatch = normalized.match(/^(.+?)(\.xml)?$/i)
  if (!xmlExtMatch) {
    return "feed.xml"
  }

  let baseName = xmlExtMatch[1]

  // Remove any trailing dots, spaces, or underscores from base name
  baseName = baseName.replace(/[._\s]+$/, "")

  // Remove any invalid characters that Chrome might sanitize
  // Keep alphanumeric, dots, hyphens, underscores, and spaces
  baseName = baseName.replace(/[^a-zA-Z0-9._\-\s]/g, "_")

  // Remove multiple consecutive underscores
  baseName = baseName.replace(/_+/g, "_")

  // Remove trailing dots/spaces/underscores again (after cleaning)
  baseName = baseName.replace(/[._\s]+$/, "")

  // Ensure base name is not empty
  if (!baseName) {
    baseName = "feed"
  }

  // Always append .xml extension (lowercase)
  return baseName + ".xml"
}

/**
 * Extract filename from Content-Disposition header.
 * Handles both quoted and unquoted filenames.
 */
export function extractFilenameFromContentDisposition(
  contentDisposition: string | null
): string | null {
  if (!contentDisposition) {
    return null
  }

  // Try RFC 5987 format first: filename*=UTF-8''encoded-name
  const rfc5987Match = contentDisposition.match(/filename\*=UTF-8''(.+)/i)
  if (rfc5987Match) {
    try {
      return decodeURIComponent(rfc5987Match[1])
    } catch {
      // If decoding fails, continue to other formats
    }
  }

  // Try quoted filename: filename="name"
  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i)
  if (quotedMatch) {
    return quotedMatch[1]
  }

  // Try unquoted filename: filename=name
  const unquotedMatch = contentDisposition.match(/filename=([^;,\s]+)/i)
  if (unquotedMatch) {
    return unquotedMatch[1]
  }

  return null
}

