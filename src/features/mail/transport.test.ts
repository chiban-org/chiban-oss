import nodemailer from 'nodemailer'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { createTransportFrom, type MailMessage } from '@/features/mail/transport'

const signal = new AbortController().signal

const message: MailMessage = {
  to: 'inspector@alderpond.example',
  subject: 'Inspection scheduled',
  text: 'Body',
  html: '<p>Body</p>',
  icalEvent: {
    method: 'REQUEST',
    filename: 'inspection.ics',
    content: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n',
  },
}

describe('mail transports carry calendar events', () => {
  it('memory transport keeps icalEvent', async () => {
    const mail = createMemoryTransport()
    await mail.send(message, signal)
    expect(mail.sent[0]?.icalEvent).toEqual(message.icalEvent)
  })

  it('smtp transport passes icalEvent to nodemailer', async () => {
    const json = nodemailer.createTransport({ jsonTransport: true })
    const spy = vi.spyOn(json, 'sendMail')
    const mail = createTransportFrom(json, 'Town <noreply@alderpond.example>')
    const result = await mail.send(message, signal)
    expect(result.ok).toBe(true)
    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      from: 'Town <noreply@alderpond.example>',
      icalEvent: { method: 'REQUEST', filename: 'inspection.ics' },
    })
    const delivered = await spy.mock.results[0]?.value
    const parsed = JSON.parse(String((delivered as { message: string }).message)) as {
      icalEvent?: { method: string }
    }
    expect(parsed.icalEvent?.method).toBe('REQUEST')
  })

  it('a message without icalEvent is unchanged', async () => {
    const mail = createMemoryTransport()
    const { icalEvent: _omit, ...plain } = message
    await mail.send(plain, signal)
    expect(mail.sent[0]).toEqual(plain)
  })
})

describe('mail transports carry file attachments', () => {
  it('smtp transport passes a report attachment to nodemailer as a named file', async () => {
    const json = nodemailer.createTransport({ jsonTransport: true })
    const spy = vi.spyOn(json, 'sendMail')
    const mail = createTransportFrom(json, 'Town <noreply@alderpond.example>')
    const { icalEvent: _omit, ...plain } = message
    const result = await mail.send(
      {
        ...plain,
        attachments: [
          {
            filename: 'permit-volume-2026-10-01-to-2026-10-31.csv',
            contentType: 'text/csv; charset=utf-8',
            content: Buffer.from('Month,Type\r\n', 'utf8'),
          },
        ],
      },
      signal,
    )
    expect(result.ok).toBe(true)
    const delivered = await spy.mock.results[0]?.value
    const parsed = JSON.parse(String((delivered as { message: string }).message)) as {
      attachments?: { filename: string; contentType: string }[]
    }
    expect(parsed.attachments?.[0]).toMatchObject({
      filename: 'permit-volume-2026-10-01-to-2026-10-31.csv',
      contentType: 'text/csv; charset=utf-8',
    })
  })
})

describe('the sender of outgoing mail', () => {
  const OPTIONS = {
    townName: () => Promise.resolve('Town of Fernhollow'),
    baseUrl: 'https://permits.fernhollow.example',
  }

  async function senderOf(from: string | undefined) {
    const json = nodemailer.createTransport({ jsonTransport: true })
    const spy = vi.spyOn(json, 'sendMail')
    const { icalEvent: _omit, ...plain } = message
    await createTransportFrom(json, from, OPTIONS).send(plain, signal)
    return (spy.mock.calls[0]?.[0] as { from: string }).from
  }

  it('with MAIL_FROM unset, sends as the town from the host of the application', async () => {
    expect(await senderOf(undefined)).toBe(
      'Town of Fernhollow <noreply@permits.fernhollow.example>',
    )
  })

  it('a bare address takes the town name', async () => {
    expect(await senderOf('permits@fernhollow.example')).toBe(
      'Town of Fernhollow <permits@fernhollow.example>',
    )
  })

  it('an address with a display name keeps its name', async () => {
    expect(await senderOf('Fernhollow Permits <permits@fernhollow.example>')).toBe(
      'Fernhollow Permits <permits@fernhollow.example>',
    )
  })

  it('quotes a town name that carries punctuation', async () => {
    const json = nodemailer.createTransport({ jsonTransport: true })
    const spy = vi.spyOn(json, 'sendMail')
    const { icalEvent: _omit, ...plain } = message
    await createTransportFrom(json, undefined, {
      ...OPTIONS,
      townName: () => Promise.resolve('Town of St. Anne'),
    }).send(plain, signal)
    expect((spy.mock.calls[0]?.[0] as { from: string }).from).toBe(
      '"Town of St. Anne" <noreply@permits.fernhollow.example>',
    )
  })
})
