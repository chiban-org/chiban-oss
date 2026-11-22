import nodemailer, { type Transporter } from 'nodemailer'
import { env } from '@/config/env'
import { resolveSender, type SenderSource } from '@/features/mail/mailbox'
import { getTownSettings } from '@/features/town/settings'
import { log } from '@/server/log'
import { err, ok, type Result } from '@/types/result'

export interface MailAttachment {
  filename: string
  contentType: string
  content: Buffer
}

export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
  icalEvent?: { method: 'REQUEST' | 'CANCEL'; filename: string; content: string }
  attachments?: MailAttachment[]
}

export interface MailTransport {
  send(message: MailMessage, signal: AbortSignal): Promise<Result<void, 'send_failed'>>
}

export type SenderOptions = Pick<SenderSource, 'baseUrl' | 'townName'>

export function createSmtpTransport(
  smtpUrl: string,
  from: string | undefined,
  options?: SenderOptions,
): MailTransport {
  return createTransportFrom(nodemailer.createTransport(smtpUrl), from, options)
}

export function createTransportFrom(
  transporter: Transporter,
  from: string | undefined,
  options?: SenderOptions,
): MailTransport {
  return {
    async send(message, signal) {
      signal.throwIfAborted()
      try {
        const sender =
          options === undefined ? (from ?? '') : await resolveSender({ mailFrom: from, ...options })
        await transporter.sendMail({ from: sender, ...message })
        return ok(undefined)
      } catch (e) {
        log.error('[mail] send failed', e instanceof Error ? e.message : e)
        return err('send_failed')
      }
    },
  }
}

let shared: MailTransport | undefined

export function getMailTransport(): MailTransport {
  shared ??= createSmtpTransport(env.SMTP_URL, env.MAIL_FROM, {
    baseUrl: env.BASE_URL,
    townName: townNameFromSettings,
  })
  return shared
}

async function townNameFromSettings(): Promise<string> {
  const { db } = await import('@/db/client')
  const town = await getTownSettings(db, new AbortController().signal)
  return town.ok ? town.value.name : ''
}
