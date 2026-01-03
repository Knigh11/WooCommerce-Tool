/**
 * Client session helper - generates and stores unique session ID
 */

const CLIENT_SESSION_KEY = 'mmb_client_session'

/**
 * Get or create client session ID
 * @returns Client session UUID
 */
export function getClientSession(): string {
  let session = localStorage.getItem(CLIENT_SESSION_KEY)
  
  if (!session) {
    // Generate UUID v4
    session = crypto.randomUUID()
    localStorage.setItem(CLIENT_SESSION_KEY, session)
  }
  
  return session
}

