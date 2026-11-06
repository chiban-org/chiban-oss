import { vi } from 'vitest'
import type * as TransportModule from '@/features/mail/transport'
import { harnessState } from '../state'

const actual = await vi.importActual<typeof TransportModule>('@/features/mail/transport')

export const { createSmtpTransport, createTransportFrom } = actual

export function getMailTransport(): TransportModule.MailTransport {
  return harnessState.mail
}

export const everyExportMocked = {
  createSmtpTransport,
  createTransportFrom,
  getMailTransport,
} satisfies Record<keyof typeof TransportModule, unknown>
