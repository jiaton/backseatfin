import createClient from 'openapi-fetch'

import type { paths } from '@/lib/api/schema'
import { API_PREFIX } from '@/player/net'

// On the car host everything of ours lives under /car; see player/net.
export { API_PREFIX }

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}


// Auth is an HttpOnly cookie (device or player session), sent automatically on
// same-origin requests — there is no credential for this code to attach.
export const api = createClient<paths>({
  baseUrl: window.location.origin + API_PREFIX,
  // Resolve fetch per call instead of capturing it at import time, so anything that
  // wraps fetch later (MSW in tests) is honored.
  fetch: (request) => globalThis.fetch(request),
})

/** openapi-fetch returns {data, error, response}; turn failures into thrown ApiErrors
 * so TanStack Query sees them as errors. */
export async function unwrap<T>(
  promise: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await promise
  if (!response.ok) {
    const detail = (error as { detail?: unknown } | undefined)?.detail
    throw new ApiError(response.status, typeof detail === 'string' ? detail : response.statusText)
  }
  return data as T
}

export const isUnauthorized = (e: unknown) => e instanceof ApiError && e.status === 401
