export const BACKEND_BASE_URL = 'http://127.0.0.1:8080'

const LOCAL_SESSION_STORAGE_KEY = 'agentmusic_local_session'

function parseStoredValue(rawValue) {
  if (!rawValue) {
    return null
  }

  try {
    return JSON.parse(rawValue)
  } catch {
    return null
  }
}

export function getStoredLocalSession() {
  const session = parseStoredValue(localStorage.getItem(LOCAL_SESSION_STORAGE_KEY))

  if (!session?.token) {
    localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY)
    return null
  }

  return session
}

export function storeLocalSession(session) {
  if (!session?.token) {
    return
  }

  localStorage.setItem(LOCAL_SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredLocalSession() {
  localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY)
}

export async function backendRequest(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
  }
  const hasBody = options.body !== undefined
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData

  if (options.token && !headers.Authorization) {
    headers.Authorization = `Bearer ${options.token}`
  }

  if (hasBody && !isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: hasBody
      ? isFormData
        ? options.body
        : JSON.stringify(options.body)
      : undefined,
    signal: options.signal,
  })

  const raw = await response.text()
  let data = null

  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch {
      data = raw
    }
  }

  if (!response.ok) {
    const error = new Error(data?.error || data?.message || raw || 'request_failed')
    error.status = response.status
    error.payload = data
    throw error
  }

  return data
}
