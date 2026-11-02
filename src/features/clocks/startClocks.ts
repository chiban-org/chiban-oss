import type { ClockRule, StartEvent } from '@packs/nh/schema'
import { and, eq, inArray } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'
import { clocks } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { boardMeetingCalendar, type MeetingCalendar } from '@/features/boards/calendar'
import type { DueResult } from '@/features/clocks/computeDue'
import { describeCounting } from '@/features/clocks/describeCounting'
import { describeMeetingBound, meetingBoundTiming } from '@/features/clocks/meetingBoundTiming'
import {
  computeRuleDue,
  type ResolvedLength,
  resolveRuleLength,
  rulesForEvent,
} from '@/features/clocks/ruleEngine'
import { effectiveBindings } from '@/features/config/bindings'
import { getPublished } from '@/features/config/store'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import { PACK_COUNTING_CITATIONS, packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, type Pack, ruleByKey } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

export async function resolveClockLength(
  tx: DbOrTx,
  rule: ClockRule,
  facts: ProjectFacts,
  pack: Pack,
  signal: AbortSignal,
): Promise<ResolvedLength> {
  if (!('fromSetting' in rule.length)) return resolveRuleLength(rule, facts, null, undefined)
  const setting = ruleByKey(pack, rule.length.fromSetting)
  const published = await getPublished(tx, 'town_rule_setting', rule.length.fromSetting, signal)
  const townValue = (published?.body as { value: number } | undefined)?.value
  return resolveRuleLength(rule, facts, setting, townValue)
}

export async function startClocksFor(
  tx: Tx,
  applicationId: string,
  event: StartEvent,
  onDate: CivilDate,
  signal: AbortSignal,
  pack: Pack = loadPack(),
  calendar: MeetingCalendar = boardMeetingCalendar(tx),
): Promise<void> {
  signal.throwIfAborted()
  const app = await loadApplicationContext(tx, applicationId, signal)
  if (app === null) return
  const bound = new Set(effectiveBindings(app.typeBody, pack))
  const rules = rulesForEvent(pack.rules, event, bound)
  const running = await tx
    .select({ ruleKey: clocks.ruleKey })
    .from(clocks)
    .where(and(eq(clocks.applicationId, applicationId), eq(clocks.status, 'running')))
  const runningKeys = new Set(running.map((c) => c.ruleKey))
  for (const rule of rules) {
    if (runningKeys.has(rule.key)) continue
    await createClock(
      tx,
      { applicationId, rule, facts: app.facts, event, onDate, pack, calendar },
      signal,
    )
  }
}

export interface NewClockInput {
  applicationId: string
  rule: ClockRule
  facts: ProjectFacts
  event: StartEvent
  onDate: CivilDate
  pack: Pack
  calendar?: MeetingCalendar
}

export async function createClock(
  tx: Tx,
  input: NewClockInput,
  signal: AbortSignal,
): Promise<string> {
  const { applicationId, rule, event, onDate, pack } = input
  const length = await resolveClockLength(tx, rule, input.facts, pack, signal)
  const holidays = packHolidayCalendar()
  const bound = await meetingBoundTiming(
    { rule, length, onDate, pack, calendar: input.calendar ?? boardMeetingCalendar(tx) },
    signal,
  )
  const due: DueResult = bound ?? computeRuleDue(rule, length, onDate, holidays)
  const packDue = computeRuleDue(
    rule,
    { unit: length.unit, value: length.packDefault },
    onDate,
    holidays,
  )
  const [row] = await tx
    .insert(clocks)
    .values({
      applicationId,
      ruleKey: rule.key,
      ruleVersion: rule.version,
      packVersion: pack.version,
      startEvent: event,
      startDate: onDate,
      lengthValue: length.value,
      lengthUnit: length.unit,
      countingMethod:
        bound === null
          ? describeCounting(
              {
                start: onDate,
                length,
                direction: rule.direction,
                clockType: rule.clockType,
                holidays,
              },
              due,
              PACK_COUNTING_CITATIONS,
            )
          : describeMeetingBound(bound, onDate, length.value),
      computedDue: due.due,
      currentDue: due.due,
      rolledFrom: due.rolledFrom,
      source: length.source,
      replacedDue: length.source === 'town_setting' ? packDue.due : null,
    })
    .returning({ id: clocks.id })
  return row?.id ?? ''
}

export async function stopRunningClocks(
  tx: Tx,
  applicationId: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  await tx
    .update(clocks)
    .set({ status: 'stopped' })
    .where(
      and(eq(clocks.applicationId, applicationId), inArray(clocks.status, ['running', 'overdue'])),
    )
}

export async function markClockMet(
  tx: Tx,
  applicationId: string,
  ruleKey: string,
  onDate: CivilDate,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  await tx
    .update(clocks)
    .set({ status: 'met', metOn: onDate })
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        eq(clocks.ruleKey, ruleKey),
        inArray(clocks.status, ['running', 'overdue']),
      ),
    )
}
