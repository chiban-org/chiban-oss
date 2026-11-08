import { JOB_NAMES } from '@/constants/jobNames'
import { getMailTransport, type MailTransport } from '@/features/mail/transport'
import { sendDueReports } from '@/features/reports/scheduledSend'
import { ok } from '@/types/result'
import { defineJob, failKeepingWrites } from './defineJob'

const HOUR_SECONDS = 3600
const HOUR_CHARS = 13

export function makeReportsScheduledJob(deps: { mail: MailTransport; now?: () => Date }) {
  const now = () => deps.now?.() ?? new Date()
  return defineJob<object>({
    name: JOB_NAMES.REPORTS_SCHEDULED,
    intervalSeconds: HOUR_SECONDS,
    dedupKey: () => `${JOB_NAMES.REPORTS_SCHEDULED}:${now().toISOString().slice(0, HOUR_CHARS)}`,
    handler: async (_payload, ctx) => {
      const result = await sendDueReports({ ...ctx, mail: deps.mail, now: now() })
      return result.ok ? ok(undefined) : failKeepingWrites(result.error)
    },
  })
}

export const reportsScheduledJob = makeReportsScheduledJob({
  get mail() {
    return getMailTransport()
  },
})
