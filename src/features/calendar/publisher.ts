import type { CalendarBooking } from '@/features/calendar/ics'
import type { Result } from '@/types/result'

export interface CalendarError {
  kind: 'unreachable' | 'rejected' | 'auth_failed' | 'bad_shape'
  detail: string
}

export interface CalendarPublisher {
  kind: 'ics_email' | 'graph'
  publish(
    booking: CalendarBooking,
    previousRef: string | null,
    signal: AbortSignal,
  ): Promise<Result<{ externalRef: string | null }, CalendarError>>
  cancel(
    booking: CalendarBooking,
    externalRef: string | null,
    signal: AbortSignal,
  ): Promise<Result<void, CalendarError>>
}
