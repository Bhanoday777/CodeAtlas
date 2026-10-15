import { useCallback, useEffect, useState } from 'react'

import { ApiError } from '../services/api'

export type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: ApiError }

type Settled<T> = Extract<RequestState<T>, { status: 'success' | 'error' }>

/**
 * Runs `load(key)` whenever `key` changes; `key === null` means "nothing to load".
 *
 * `load` must be stable (a module-level function), because it is an effect dependency.
 * A newer key aborts the older request, so a slow response never replaces a newer one.
 */
export function useApiRequest<T>(
  key: string | null,
  load: (key: string, signal: AbortSignal) => Promise<T>,
): RequestState<T> & { retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<{ token: string; state: Settled<T> } | null>(null)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    if (key === null) return
    const controller = new AbortController()
    const token = `${attempt}\u0000${key}`
    load(key, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setSettled({ token, state: { status: 'success', data } })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        const apiError =
          error instanceof ApiError
            ? error
            : new ApiError('invalid', error instanceof Error ? error.message : 'Unexpected error')
        setSettled({ token, state: { status: 'error', error: apiError } })
      },
    )
    return () => controller.abort()
  }, [key, attempt, load])

  if (key === null) return { status: 'idle', retry }
  if (settled?.token !== `${attempt}\u0000${key}`) return { status: 'loading', retry }
  return { ...settled.state, retry }
}
