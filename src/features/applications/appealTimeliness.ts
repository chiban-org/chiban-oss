import type { DbOrTx } from '@/db/client'
import type { ApplicationContext } from '@/features/applications/context'
import { type LengthOf, resolvedLength } from '@/features/clocks/resolvedLength'
import { computeRuleDue, resolveRuleLength } from '@/features/clocks/ruleEngine'
import { getVersion } from '@/features/config/store'
import type { FormBody } from '@/features/forms/formSchema'
import type { FieldValue, ProjectFacts } from '@/features/forms/validateSubmission'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { packRoles } from '@/features/packs/roles'
import type { ClockRule } from '@/features/packs/schema'
import { formatCivilDate } from '@/lib/formatDate'
import { type CivilDate, compareCivil, parseCivilDate } from '@/types/civilDate'

const NO_FACTS: ProjectFacts = { classification: null, dwellingUnits: null, afterTheFact: false }

export interface AppealTimelinessInput {
  form: Pick<FormBody, 'fields'>
  values: Record<string, FieldValue>
  receivedDate: CivilDate | null
  length?: LengthOf
}

function appealWindowRule(): ClockRule | null {
  const key = packRoles().rules.adminAppealToZba
  if (key === null) return null
  const rule = ruleByKey(loadPack(), key)
  return rule.kind === 'clock' ? rule : null
}

function appealedDecisionDate(input: AppealTimelinessInput): CivilDate | null {
  const field = input.form.fields.find((f) => f.fact === 'appealedDecisionDate')
  const raw = field === undefined ? undefined : input.values[field.key]
  if (typeof raw !== 'string') return null
  const parsed = parseCivilDate(raw)
  return parsed.ok ? parsed.value : null
}

function packLength(rule: ClockRule): LengthOf {
  const settingKey = 'fromSetting' in rule.length ? rule.length.fromSetting : null
  const setting = settingKey === null ? null : ruleByKey(loadPack(), settingKey)
  const { unit, value } = resolveRuleLength(rule, NO_FACTS, setting, undefined)
  return { unit, value }
}

export function lateAppealWarning(input: AppealTimelinessInput): string | null {
  const decidedOn = appealedDecisionDate(input)
  const rule = appealWindowRule()
  if (decidedOn === null || input.receivedDate === null || rule === null) return null
  const length = input.length ?? packLength(rule)
  const closes = computeRuleDue(rule, length, decidedOn, packHolidayCalendar()).due
  if (compareCivil(input.receivedDate, closes) <= 0) return null
  return `Filed after the appeal window closed on ${formatCivilDate(closes)}.`
}

export async function loadLateAppealWarning(
  db: DbOrTx,
  app: ApplicationContext | null,
  signal: AbortSignal,
): Promise<string | null> {
  const rule = appealWindowRule()
  if (app === null || rule === null) return null
  const version = await getVersion(db, app.pins.form, signal)
  const form = version?.body as FormBody | undefined
  if (form === undefined || !form.fields.some((f) => f.fact === 'appealedDecisionDate')) return null
  return lateAppealWarning({
    form,
    values: app.values,
    receivedDate: app.receivedDate,
    length: await resolvedLength(db, rule, signal),
  })
}
