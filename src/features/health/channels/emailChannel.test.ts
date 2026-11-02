import { describe, expect, it } from 'vitest'
import { createEmailChannel } from '@/features/health/channels/emailChannel'
import type { MailTransport } from '@/features/mail/transport'
import { ok } from '@/types/result'

function capture() {
  const sent: { subject: string; text: string }[] = []
  const mail = {
    send: (m: { subject: string; text: string }) => {
      sent.push(m)
      return Promise.resolve(ok(undefined))
    },
  } as unknown as MailTransport
  return { sent, mail }
}

const base = {
  severity: 'warning',
  townName: 'Alder Pond',
  ackUrl: null,
} as const

describe('email alert channel', () => {
  it('does not print the internal synthetic key in a test alert', async () => {
    const { sent, mail } = capture()
    await createEmailChannel(mail, ['a@example.com']).send(
      {
        ...base,
        key: 'synthetic:3f2b6c1e-0000-4000-8000-000000000000',
        kind: 'synthetic',
        state: 'test',
        summary: 'Test alert: confirm this reached you',
      },
      new AbortController().signal,
    )
    expect(sent[0]?.text).not.toContain('synthetic:')
    expect(sent[0]?.text).not.toContain('3f2b6c1e')
    expect(sent[0]?.text).toContain('This is a test of the alert path.')
  })
})
