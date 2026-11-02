import nodemailer from 'nodemailer'
import { env } from '@/config/env'
import { err, ok, type Result } from '@/types/result'

export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
}

export interface MailTransport {
  send(message: MailMessage, signal: AbortSignal): Promise<Result<void, 'send_failed'>>
}

export function createSmtpTransport(smtpUrl: string, from: string): MailTransport {
  const transporter = nodemailer.createTransport(smtpUrl)
  return {
    async send(message, signal) {
      signal.throwIfAborted()
      try {
        await transporter.sendMail({ from, ...message })
        return ok(undefined)
      } catch (e) {
        console.error('[mail] send failed', e instanceof Error ? e.message : e)
        return err('send_failed')
      }
    },
  }
}

let shared: MailTransport | undefined

export function getMailTransport(): MailTransport {
  shared ??= createSmtpTransport(env.SMTP_URL, env.MAIL_FROM)
  return shared
}
