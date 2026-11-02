import { env } from '@/config/env'
import { ErrorIds, isAppError } from '@/constants/errorIds'
import { JOB_NAMES } from '@/constants/jobNames'
import { deliverPush } from '@/features/calendar/deliverPush'
import { createIcsEmailPublisher } from '@/features/calendar/icsEmailPublisher'
import { createPublisherFactory } from '@/features/calendar/publisherFactory'
import { getMailTransport, type MailTransport } from '@/features/mail/transport'
import { ok } from '@/types/result'
import { defineJob, enqueue, failKeepingWrites } from './defineJob'

interface PushPayload {
  pushId: string
  attempts: number
}

export function makeCalendarPushJob(deps: { mail: MailTransport; now?: () => Date }) {
  return defineJob<PushPayload>({
    name: JOB_NAMES.CALENDAR_PUSH,
    dedupKey: (p) => `${JOB_NAMES.CALENDAR_PUSH}:${p.pushId}:${p.attempts}`,
    handler: async (payload, ctx) => {
      const now = deps.now?.() ?? new Date()
      const publisherFor = createPublisherFactory(ctx.db, {
        ics: createIcsEmailPublisher({ mail: deps.mail, organizerEmail: env.MAIL_FROM }),
        now: () => now,
      })
      const result = await deliverPush(ctx.db, { publisherFor, now }, payload.pushId, ctx.signal)
      return result.ok ? ok(undefined) : failKeepingWrites(result.error.detail)
    },
  })
}

export const calendarPushJob = makeCalendarPushJob({
  get mail() {
    return getMailTransport()
  },
})

export async function enqueueCalendarPushes(pushIds: string[], signal: AbortSignal): Promise<void> {
  for (const pushId of pushIds) {
    try {
      await enqueue(calendarPushJob, { pushId, attempts: 0 }, signal)
    } catch (e) {
      if (!isAppError(e) || e.id !== ErrorIds.JOB_BOSS_MISSING) throw e
    }
  }
}
