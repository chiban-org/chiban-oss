import { and, eq, inArray, ne } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'
import { clocks } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { boardMeetingCalendar, type MeetingCalendar } from '@/features/boards/calendar'
import type { DueResult } from '@/features/clocks/computeDue'
import { factsWithDeterminations } from '@/features/clocks/derivedFacts'
import { describeCounting } from '@/features/clocks/describeCounting'
import { describeMeetingBound, meetingBoundTiming } from '@/features/clocks/meetingBoundTiming'
import { effectiveNoticeLeadDays } from '@/features/clocks/noticeLead'
import { townSettingValue } from '@/features/clocks/resolvedLength'
import {
  computeRuleDue,
  eventMovesClocks,
  hasLocalBound,
  hearingDependentRulesForEvent,
  keysCancelledBy,
  keysOnlyIfHearingScheduled,
  type ResolvedLength,
  resolveRuleLength,
  rulesForEvent,
} from '@/features/clocks/ruleEngine'
import { significanceFact } from '@/features/clocks/significanceFact'
import { effectiveBindings } from '@/features/config/bindings'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import { electedHearing } from '@/features/hearings/electedHearing'
import { packCountingCitations, packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, type Pack, ruleByKey } from '@/features/packs/loadPack'
import type { ClockRule, StartEvent } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'

export async function resolveClockLength(
  tx: DbOrTx,
  rule: ClockRule,
  facts: ProjectFacts,
  pack: Pack,
  signal: AbortSignal,
): Promise<ResolvedLength> {
  if (!('fromSetting' in rule.length)) {
    if (!hasLocalBound(rule)) return resolveRuleLength(rule, facts, null, undefined)
    return resolveRuleLength(rule, facts, null, await townSettingValue(tx, rule.key, signal))
  }
  const setting = ruleByKey(pack, rule.length.fromSetting)
  const townValue = await townSettingValue(tx, rule.length.fromSetting, signal)
  return resolveRuleLength(rule, facts, setting, townValue)
}

const ONCE_PER_APPLICATION: readonly StartEvent[] = ['project_final_approval']

function deliveryDueKeys(pack: Pack): ReadonlySet<string> {
  return new Set(pack.rules.flatMap((r) => (r.kind === 'decision_delivery' ? [r.dueRuleKey] : [])))
}

export async function clockStartedOn(
  tx: Tx,
  applicationId: string,
  ruleKey: string,
  startDate: CivilDate,
): Promise<boolean> {
  const [found] = await tx
    .select({ id: clocks.id })
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        eq(clocks.ruleKey, ruleKey),
        eq(clocks.startDate, startDate),
        ne(clocks.status, 'superseded'),
      ),
    )
    .limit(1)
  return found !== undefined
}

export async function startClocksFor(
  tx: Tx,
  applicationId: string,
  event: StartEvent,
  onDate: CivilDate,
  signal: AbortSignal,
  pack: Pack = loadPack(),
  calendar: MeetingCalendar = boardMeetingCalendar(tx),
  decisionFacts: Pick<ProjectFacts, 'outcome' | 'decisionFiledLate' | 'finalReviewBoard'> = {},
): Promise<void> {
  signal.throwIfAborted()
  const app = await loadApplicationContext(tx, applicationId, signal)
  if (app === null) return
  const facts = {
    ...(await factsWithDeterminations(tx, applicationId, app.facts)),
    ...(await significanceFact(tx, applicationId, pack)),
    ...decisionFacts,
  }
  const bound = new Set(effectiveBindings(app.typeBody, pack))
  await cancelClocksFor(tx, applicationId, event, pack)
  const hearing = await hearingDependentStart(tx, applicationId, { pack, event, bound, facts })
  const rules = [...rulesForEvent(pack.rules, event, bound, facts), ...hearing.rules]
  const started = ONCE_PER_APPLICATION.includes(event)
    ? ne(clocks.status, 'superseded')
    : eq(clocks.status, 'running')
  const existing = await tx
    .select({ ruleKey: clocks.ruleKey })
    .from(clocks)
    .where(and(eq(clocks.applicationId, applicationId), started))
  const existingKeys = new Set(existing.map((c) => c.ruleKey))
  const perSource = deliveryDueKeys(pack)
  for (const rule of rules) {
    if (perSource.has(rule.key)) {
      if (await clockStartedOn(tx, applicationId, rule.key, onDate)) continue
    } else if (existingKeys.has(rule.key)) continue
    await createClock(tx, { applicationId, rule, facts, event, onDate, pack, calendar }, signal)
  }
  await meetIfHearingHeld(tx, applicationId, hearing, signal)
}

interface HearingDependentStart {
  rules: ClockRule[]
  heldOn: CivilDate | null
}

async function hearingDependentStart(
  tx: Tx,
  applicationId: string,
  s: { pack: Pack; event: StartEvent; bound: ReadonlySet<string>; facts: ProjectFacts },
): Promise<HearingDependentStart> {
  if (keysOnlyIfHearingScheduled(s.pack.rules).length === 0) return { rules: [], heldOn: null }
  const elected = await electedHearing(tx, applicationId)
  if (elected === null) return { rules: [], heldOn: null }
  return {
    rules: hearingDependentRulesForEvent(s.pack.rules, s.event, s.bound, s.facts),
    heldOn: elected.firstHeldOn,
  }
}

export async function meetIfHearingHeld(
  tx: Tx,
  applicationId: string,
  hearing: HearingDependentStart,
  signal: AbortSignal,
): Promise<void> {
  if (hearing.heldOn === null) return
  for (const rule of hearing.rules) {
    await markClockMet(tx, applicationId, rule.key, hearing.heldOn, signal)
  }
}

export async function startClocksWhenPackUses(
  tx: Tx,
  applicationId: string,
  event: StartEvent,
  onDate: CivilDate,
  signal: AbortSignal,
): Promise<void> {
  const pack = loadPack()
  if (!eventMovesClocks(pack.rules, event)) return
  await startClocksFor(tx, applicationId, event, onDate, signal, pack)
}

async function cancelClocksFor(
  tx: Tx,
  applicationId: string,
  event: StartEvent,
  pack: Pack,
): Promise<void> {
  const cancelledKeys = keysCancelledBy(pack.rules, event)
  if (cancelledKeys.length === 0) return
  await tx
    .update(clocks)
    .set({ status: 'superseded', supersededReason: 'cancelled_by_event' })
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        inArray(clocks.status, ['running', 'overdue']),
        inArray(clocks.ruleKey, cancelledKeys),
      ),
    )
}

export interface NewClockInput {
  applicationId: string
  rule: ClockRule
  facts: ProjectFacts
  event: StartEvent
  onDate: CivilDate
  pack: Pack
  calendar?: MeetingCalendar
  lengthOverrideDays?: number
}

export async function createClock(
  tx: Tx,
  input: NewClockInput,
  signal: AbortSignal,
): Promise<string> {
  const { applicationId, rule, event, onDate, pack } = input
  const resolved = await resolveClockLength(tx, rule, input.facts, pack, signal)
  const length: ResolvedLength =
    input.lengthOverrideDays === undefined
      ? resolved
      : { ...resolved, value: input.lengthOverrideDays, source: 'town_setting' }
  const holidays = packHolidayCalendar()
  const bound = await meetingBoundTiming(
    {
      rule,
      length,
      onDate,
      pack,
      calendar: input.calendar ?? boardMeetingCalendar(tx),
      noticeLeadDays: await effectiveNoticeLeadDays(tx, rule, input.facts, pack, signal),
    },
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
              packCountingCitations(),
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
  ruleKey: string | null,
  onDate: CivilDate,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  if (ruleKey === null) return
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
