import { z } from 'zod'
import type { CalendarBooking } from '@/features/calendar/ics'
import type { CalendarError, CalendarPublisher } from '@/features/calendar/publisher'
import { createTokenProvider, type TokenDeps } from '@/features/microsoft/graphToken'
import { err, ok, type Result } from '@/types/result'

export const GRAPH_ADAPTER_STATUS = 'stubbed' as const

const EventResponseSchema = z.object({ id: z.string().min(1) })

export interface GraphAccount {
  tenantId: string
  clientId: string
  authorityBase: string
  graphBase: string
}

function graphDateTime(instant: Date): string {
  return instant.toISOString().replace(/\.\d{3}Z$/, '')
}

function eventBody(booking: CalendarBooking) {
  return {
    subject: booking.summary,
    body: { contentType: 'text', content: booking.description },
    start: { dateTime: graphDateTime(booking.startUtc), timeZone: 'UTC' },
    end: { dateTime: graphDateTime(booking.endUtc), timeZone: 'UTC' },
    location: { displayName: booking.location },
    transactionId: `${booking.uid}:${booking.sequence}`,
  }
}

function failure(status: number): CalendarError {
  if (status === 401 || status === 403) {
    return { kind: 'auth_failed', detail: `Graph refused the request (${status})` }
  }
  if (status === 429 || status >= 500) {
    return { kind: 'unreachable', detail: `Graph answered ${status}` }
  }
  return { kind: 'rejected', detail: `Graph rejected the request (${status})` }
}

export function createGraphPublisher(
  account: GraphAccount,
  secret: string,
  deps: TokenDeps,
): CalendarPublisher {
  const tokens = createTokenProvider(account, secret, deps)

  async function call(
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body: unknown,
    signal: AbortSignal,
  ): Promise<Result<Response, CalendarError>> {
    const token = await tokens.get(signal)
    if (!token.ok) return token
    try {
      const response = await deps.fetch(`${account.graphBase}/v1.0/${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token.value}`,
          ...(body === null ? {} : { 'content-type': 'application/json' }),
        },
        body: body === null ? undefined : JSON.stringify(body),
        signal,
      })
      return ok(response)
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e
      return err({ kind: 'unreachable', detail: 'Graph did not answer' })
    }
  }

  const userPath = (booking: CalendarBooking): string =>
    `users/${encodeURIComponent(booking.targetUserRef ?? booking.attendeeEmail)}/events`

  return {
    kind: 'graph',
    async publish(booking, previousRef, signal) {
      const path =
        previousRef === null
          ? userPath(booking)
          : `${userPath(booking)}/${encodeURIComponent(previousRef)}`
      const sent = await call(
        previousRef === null ? 'POST' : 'PATCH',
        path,
        eventBody(booking),
        signal,
      )
      if (!sent.ok) return sent
      if (!sent.value.ok) return err(failure(sent.value.status))
      const parsed = EventResponseSchema.safeParse(await sent.value.json().catch(() => null))
      if (!parsed.success) return err({ kind: 'bad_shape', detail: 'event response had no id' })
      return ok({ externalRef: parsed.data.id })
    },
    async cancel(booking, externalRef, signal) {
      if (externalRef === null) return ok(undefined)
      const sent = await call(
        'DELETE',
        `${userPath(booking)}/${encodeURIComponent(externalRef)}`,
        null,
        signal,
      )
      if (!sent.ok) return sent
      if (sent.value.status === 404 || sent.value.ok) return ok(undefined)
      return err(failure(sent.value.status))
    },
  }
}
