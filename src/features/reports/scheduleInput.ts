import { z } from 'zod'
import type { Db } from '@/db/client'
import { REPORT_FREQUENCIES, SCHEDULABLE_REPORTS } from '@/db/schema'
import { reportTitle } from '@/features/reports/reportExport'
import { mayReceive, recipientChoices } from '@/features/reports/scheduleAccess'
import { err, ok, type Result } from '@/types/result'

const MAX_RECIPIENTS = 50

export const ScheduleFields = z.object({
  report: z.enum(SCHEDULABLE_REPORTS),
  frequency: z.enum(REPORT_FREQUENCIES),
  recipientIds: z
    .array(z.string().uuid())
    .min(1, 'Choose at least one person to send it to.')
    .max(MAX_RECIPIENTS, `Choose at most ${MAX_RECIPIENTS} people.`),
})
export type ScheduleFieldsInput = z.infer<typeof ScheduleFields>

export type ScheduleError = 'forbidden' | 'not_found' | { invalid: Record<string, string> }

async function problemsWith(db: Db, input: ScheduleFieldsInput): Promise<Record<string, string>> {
  const problems: Record<string, string> = {}
  if (input.report === 'census' && input.frequency !== 'monthly') {
    problems.frequency = 'The census report goes out monthly.'
  }
  const choices = new Map((await recipientChoices(db)).map((c) => [c.id, c]))
  const refused = [...new Set(input.recipientIds)].flatMap((id) => {
    const choice = choices.get(id)
    if (choice === undefined) return ['Someone you chose']
    return mayReceive(choice, input.report) ? [] : [choice.name]
  })
  if (refused.length > 0) {
    problems.recipientIds = `${refused.join(', ')} cannot see the ${reportTitle(input.report)} report.`
  }
  return problems
}

export async function validated(
  db: Db,
  raw: ScheduleFieldsInput,
): Promise<Result<ScheduleFieldsInput, ScheduleError>> {
  const parsed = ScheduleFields.safeParse(raw)
  if (!parsed.success) {
    const invalid = Object.fromEntries(
      parsed.error.issues.map((i) => [String(i.path[0] ?? '_form'), i.message]),
    )
    return err({ invalid })
  }
  const problems = await problemsWith(db, parsed.data)
  return Object.keys(problems).length > 0 ? err({ invalid: problems }) : ok(parsed.data)
}
