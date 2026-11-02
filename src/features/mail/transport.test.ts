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
