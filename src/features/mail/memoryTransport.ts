import type { MailMessage, MailTransport } from '@/features/mail/transport'
import { ok } from '@/types/result'

export interface MemoryMailTransport extends MailTransport {
  readonly sent: MailMessage[]
}

export function createMemoryTransport(): MemoryMailTransport {
  const sent: MailMessage[] = []
  return {
    sent,
    send(message, signal) {
      signal.throwIfAborted()
      sent.push(message)
      return Promise.resolve(ok(undefined))
    },
  }
}
