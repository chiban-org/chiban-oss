import type { ReaderStatus } from '@/components/counter/counterTypes'

export type CardStartResult =
  | { ok: true; attemptId: string; outcomeUnknown: boolean }
  | { ok: false; error: string }

export interface CardActions {
  start: (formData: FormData) => Promise<CardStartResult>
  reader: (formData: FormData) => Promise<ReaderStatus>
  check: (formData: FormData) => Promise<ReaderStatus>
  reconnect: (formData: FormData) => Promise<ReaderStatus>
}

export type ReaderOutcome = 'captured' | 'declined' | 'unknown'
