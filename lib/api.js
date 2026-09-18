const MAX_RETRIES = 3
const BASE_DELAY = 1000

export async function apiFetch(url, options = {}) {
  let lastError

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })

      if (res.ok) {
        return res.json()
      }

      const errorBody = await res.json().catch(() => ({}))

      if (res.status === 429) {
        const delay = BASE_DELAY * Math.pow(2, attempt) + Math.random() * 500
        await sleep(delay)
        lastError = new ApiError(errorBody.error || 'Rate limited', 'RATE_LIMIT', true)
        continue
      }

      if (res.status >= 500) {
        const delay = BASE_DELAY * Math.pow(2, attempt) + Math.random() * 500
        await sleep(delay)
        lastError = new ApiError(errorBody.error || 'Server error', 'SERVER_ERROR', true)
        continue
      }

      if (res.status === 400 && errorBody.code === 'CONTENT_BLOCKED') {
        throw new ApiError(
          errorBody.error || 'Content was blocked by safety filters. Try modifying the prompt.',
          'CONTENT_BLOCKED',
          false
        )
      }

      throw new ApiError(errorBody.error || `Request failed (${res.status})`, 'API_ERROR', false)
    } catch (err) {
      if (err instanceof ApiError && !err.retryable) throw err

      if (err.name === 'TypeError' || err.message?.includes('fetch')) {
        const delay = BASE_DELAY * Math.pow(2, attempt) + Math.random() * 500
        await sleep(delay)
        lastError = new ApiError('Network error', 'NETWORK_ERROR', true)
        continue
      }

      throw err
    }
  }

  throw lastError || new ApiError('Max retries exceeded', 'MAX_RETRIES', false)
}

class ApiError extends Error {
  constructor(message, code, retryable) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.retryable = retryable
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export { ApiError }
