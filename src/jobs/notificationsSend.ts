import { JOB_NAMES } from '@/constants/jobNames'
import { getMailTransport, type MailTransport } from '@/features/mail/transport'
import { sendQueuedNotificationsInJob } from '@/features/notifications/send'
import { ok } from '@/types/result'
import { defineJob } from './defineJob'

const MINUTE_CHARS = 16
const MINUTE_SECONDS = 60

interface SendPayload {
  at?: string
}

export function makeNotificationsSendJob(deps: { mail: MailTransport }) {
  return defineJob<SendPayload>({
    name: JOB_NAMES.NOTIFICATIONS_SEND,
    intervalSeconds: MINUTE_SECONDS,
    dedupKey: (p) =>
      `${JOB_NAMES.NOTIFICATIONS_SEND}:${(p.at ?? new Date().toISOString()).slice(0, MINUTE_CHARS)}`,
    handler: async (_payload, ctx) => {
      await sendQueuedNotificationsInJob({ ...ctx, mail: deps.mail })
      return ok(undefined)
    },
  })
}

export const notificationsSendJob = makeNotificationsSendJob({
  get mail() {
    return getMailTransport()
  },
})
