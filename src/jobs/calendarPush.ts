import { env } from '@/config/env'
import { ErrorIds, isAppError } from '@/constants/errorIds'
import { JOB_NAMES } from '@/constants/jobNames'
import { deliverPush } from '@/features/calendar/deliverPush'
import { createIcsEmailPublisher } from '@/features/calendar/icsEmailPublisher'
import { createPublisherFactory } from '@/features/calendar/publisherFactory'
import { overdueCalendarPushes } from '@/features/calendar/queuePush'
import { getMailTransport, type MailTransport } from '@/features/mail/transport'
import { ok } from '@/types/result'
import { defineJob, enqueue, failKeepingWrites } from './defineJob'

const MINUTE_CHARS = 16
const MINUTE_SECONDS = 60

interface PushPayload {
  pushId: string
  attempts: number
}

interface SweepPayload {
  at?: string
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

export const calendarSweepJob = defineJob<SweepPayload>({
  name: JOB_NAMES.CALENDAR_SWEEP,
  intervalSeconds: MINUTE_SECONDS,
  dedupKey: (p) =>
    `${JOB_NAMES.CALENDAR_SWEEP}:${(p.at ?? new Date().toISOString()).slice(0, MINUTE_CHARS)}`,
  handler: async (_payload, ctx) => {
    const overdue = await overdueCalendarPushes(ctx.db, new Date(), ctx.signal)
    for (const push of overdue) {
      await enqueue(calendarPushJob, { pushId: push.id, attempts: push.attempts }, ctx.signal)
    }
    return ok(undefined)
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
