/**
 * Store feed defaults persistence.
 * Saves/loads feed defaults per store profile in localStorage.
 */

export interface FeedDefaults {
  google_category?: string | null
  product_type?: string | null
  gender?: string | null
  age_group?: string | null
  category_id?: number | null
  sheets?: {
    sheet_id?: string
    tab_name?: string
    credentials_json_base64?: string
  }
}

const STORAGE_KEY_PREFIX = 'feed_defaults_'

/**
 * Get feed defaults for a store
 */
export function getFeedDefaults(storeId: string): FeedDefaults | null {
  try {
    const key = `${STORAGE_KEY_PREFIX}${storeId}`
    const stored = localStorage.getItem(key)
    if (!stored) return null
    
    return JSON.parse(stored) as FeedDefaults
  } catch {
    return null
  }
}

/**
 * Save feed defaults for a store
 */
export function saveFeedDefaults(storeId: string, defaults: FeedDefaults): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${storeId}`
    localStorage.setItem(key, JSON.stringify(defaults))
  } catch (error) {
    console.error('Failed to save feed defaults:', error)
  }
}

/**
 * Clear feed defaults for a store
 */
export function clearFeedDefaults(storeId: string): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${storeId}`
    localStorage.removeItem(key)
  } catch {
    // Ignore
  }
}

