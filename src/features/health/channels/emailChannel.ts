import type { MailTransport } from '@/features/mail/transport'
import { err, ok } from '@/types/result'
import type { AlertChannel, AlertMessage } from './types'

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c] ?? c)
}

const STATE_LINE: Record<AlertMessage['state'], string> = {
  firing: 'This alert is firing.',
  resolved: 'This alert has resolved.',
  test: 'This is a test of the alert path.',
}

function bodyLines(msg: AlertMessage): string[] {
  const lines = [msg.summary, STATE_LINE[msg.state]]
  if (msg.kind !== 'synthetic') lines.push(`Alert: ${msg.key}`)
  if (msg.ackUrl !== null) lines.push(`Confirm you received this test: ${msg.ackUrl}`)
  return lines
}

export function createEmailChannel(mail: MailTransport, to: string[]): AlertChannel {
  return {
    kind: 'email',
    async send(msg, signal) {
      const lines = bodyLines(msg)
      const html = lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')
      let failed = false
      for (const recipient of to) {
        const sent = await mail.send(
          {
            to: recipient,
            subject: `[${msg.severity}] ${msg.townName}: ${msg.summary}`,
            text: lines.join('\n'),
            html,
          },
          signal,
        )
        if (!sent.ok) failed = true
      }
      return failed || to.length === 0 ? err('send_failed') : ok(undefined)
    },
  }
}
