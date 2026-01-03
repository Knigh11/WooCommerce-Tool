// API Client with timing

// Use relative path in dev (via Vite proxy) or absolute URL in production
const API_BASE = import.meta.env.VITE_API_BASE;
const USE_PROXY = !API_BASE || import.meta.env.DEV; // Use proxy in dev mode

export interface ApiTiming {
  duration: number;
  timestamp: number;
}

const timingHistory: Map<string, number[]> = new Map();
const MAX_HISTORY = 20;

export function recordTiming(endpoint: string, duration: number) {
  if (!timingHistory.has(endpoint)) {
    timingHistory.set(endpoint, []);
  }
  const history = timingHistory.get(endpoint)!;
  history.push(duration);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

export function getAverageTiming(endpoint: string): number {
  const history = timingHistory.get(endpoint);
  if (!history || history.length === 0) return 0;
  const sum = history.reduce((a, b) => a + b, 0);
  return sum / history.length;
}

export async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit & { storeId?: string }
): Promise<{ data: T; timing: ApiTiming }> {
  const start = performance.now();
  // Use relative path (via proxy) in dev, or absolute URL if API_BASE is set
  const url = endpoint.startsWith('http') 
    ? endpoint 
    : USE_PROXY 
      ? endpoint  // Use relative path, Vite proxy will handle it
      : `${API_BASE}${endpoint}`;  // Use absolute URL in production
  
  try {
    // Get store API key if storeId is provided
    // Try to extract storeId from endpoint if not provided
    let storeId = options?.storeId
    if (!storeId) {
      // Try to extract from endpoint pattern: /stores/{storeId}/...
      const match = endpoint.match(/\/stores\/([^\/]+)/)
      if (match) {
        storeId = match[1]
      }
    }
    
    let storeKey: string | null = null
    if (storeId) {
      const { getStoreApiKey } = await import("../utils/storeKey")
      storeKey = getStoreApiKey(storeId)
    }
    
    // Don't set Content-Type for FormData - browser will set it automatically with boundary
    const isFormData = options?.body instanceof FormData;
    const headers: HeadersInit = isFormData
      ? { ...options?.headers }
      : {
          'Content-Type': 'application/json',
          ...options?.headers,
        };
    
    // Add X-Store-Key header if available (only if key exists, don't send empty header)
    if (storeKey && storeKey.trim()) {
      headers['X-Store-Key'] = storeKey
    }
    
    // Add X-Client-Session header for multi-user safety (if not already set)
    if (!headers['X-Client-Session']) {
      try {
        const { getClientSession } = await import("../utils/clientSession")
        headers['X-Client-Session'] = getClientSession()
      } catch {
        // Ignore if clientSession helper not available
      }
    }
    
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const duration = performance.now() - start;
    recordTiming(endpoint, duration);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API Error ${response.status}`;
      let errorCode: string | null = null;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail || errorJson.message || errorMessage;
        errorCode = errorJson.code || response.headers.get("X-Error-Code");
      } catch {
        errorMessage = errorText || errorMessage;
        errorCode = response.headers.get("X-Error-Code");
      }
      const error = new Error(errorMessage);
      (error as any).status = response.status;
      (error as any).code = errorCode;
      throw error;
    }

    const data = await response.json();

    return {
      data,
      timing: {
        duration,
        timestamp: Date.now(),
      },
    };
  } catch (error: any) {
    const duration = performance.now() - start;
    recordTiming(endpoint, duration);
    
    // Log detailed error for debugging
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      console.error(`Network error for ${url}:`, {
        endpoint,
        url,
        error: error.message,
        stack: error.stack,
      });
      throw new Error(`Network error: Cannot connect to ${API_BASE}. Check if server is running.`);
    }
    
    throw error;
  }
}

// Helper to extract slug from URL
export function extractSlugFromUrl(url: string): string | null {
  try {
    const pattern = /\/product\/([^/?#]+)\/?/;
    const match = url.match(pattern);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Helper to parse product IDs from input
export function parseProductIds(input: string): number[] {
  return input
    .split(/[,\n\s]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => parseInt(s, 10))
    .filter(n => !isNaN(n));
}
