/**
 * Store API key management.
 * Reads from store profile (StoreDetail) and caches in memory.
 */

// In-memory cache: storeId -> api_key
const storeKeyCache = new Map<string, string>()

/**
 * Get store API key from cache or store profile.
 * Supports backward compatibility with localStorage.
 */
export function getStoreApiKey(storeId: string): string | null {
  // First check in-memory cache
  if (storeKeyCache.has(storeId)) {
    return storeKeyCache.get(storeId) || null
  }
  
  // Fallback to localStorage (for backward compatibility)
  try {
    const stored = localStorage.getItem(`store_api_key_${storeId}`)
    if (stored) {
      storeKeyCache.set(storeId, stored)
      return stored
    }
  } catch {
    // Ignore localStorage errors
  }
  
  return null
}

/**
 * Set store API key in cache and localStorage.
 */
export function setStoreApiKey(storeId: string, apiKey: string): void {
  storeKeyCache.set(storeId, apiKey)
  try {
    localStorage.setItem(`store_api_key_${storeId}`, apiKey)
  } catch (error) {
    console.warn("Failed to store API key in localStorage:", error)
  }
}

/**
 * Remove store API key from cache and localStorage.
 */
export function removeStoreApiKey(storeId: string): void {
  storeKeyCache.delete(storeId)
  try {
    localStorage.removeItem(`store_api_key_${storeId}`)
  } catch {
    // Ignore
  }
}

/**
 * Update store API key from StoreDetail.
 * Called when store profile is loaded.
 */
export function updateStoreApiKeyFromProfile(storeId: string, storeDetail: { api_key?: string }): void {
  if (storeDetail.api_key) {
    setStoreApiKey(storeId, storeDetail.api_key)
  }
}
