import type { ClockLength, ClockRule, StartEvent } from '@packs/nh/schema'
import { and, eq, inArray } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { clocks } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { computeDue } from '@/features/clocks/computeDue'
import { describeCounting } from '@/features/clocks/describeCounting'
import { effectiveBindings } from '@/features/config/bindings'
import { getPublished } from '@/features/config/store'
import { evaluateCondition } from '@/features/forms/condition'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import { PACK_COUNTING_CITATIONS, packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, type Pack, ruleByKey } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

interface ResolvedLength {
  unit: 'days' | 'months'
  value: number
  source: 'pack_rule' | 'town_setting'
  packDefault: number
}

export function factMatches(
  when: Extract<ClockLength, { cases: unknown }>['cases'][number]['when'],
  facts: ProjectFacts,
): boolean {
  if (when.fact === 'classification') {
    return facts.classification !== null && when.in.includes(facts.classification)
  }
  return evaluateCondition(
    { field: 'dwellingUnits', op: 'gt', value: when.gt },
    { dwellingUnits: facts.dwellingUnits ?? 0 },
  )
}

async function resolveLength(
  tx: Tx,
  rule: ClockRule,
  facts: ProjectFacts,
  pack: Pack,
  signal: AbortSignal,
): Promise<ResolvedLength> {
  const length = rule.length
  if ('fromSetting' in length) {
    const setting = ruleByKey(pack, length.fromSetting)
    const fallback =
      setting.overridePolicy.policy === 'delegated_choice' ? setting.overridePolicy.default : 0
    const published = await getPublished(tx, 'town_rule_setting', length.fromSetting, signal)
    const townValue = (published?.body as { value: number } | undefined)?.value
    return {
      unit: length.unit,
      value: townValue ?? fallback,
      source: townValue === undefined ? 'pack_rule' : 'town_setting',
      packDefault: fallback,
    }
  }
  if ('cases' in length) {
    const hit = length.cases.find((c) => factMatches(c.when, facts))
    const value = hit?.value ?? length.otherwise
    return { unit: length.unit, value, source: 'pack_rule', packDefault: value }
  }
  return { unit: length.unit, value: length.value, source: 'pack_rule', packDefault: length.value }
}

export async function startClocksFor(
  tx: Tx,
  applicationId: string,
  event: StartEvent,
  onDate: CivilDate,
  signal: AbortSignal,
  pack: Pack = loadPack(),
): Promise<void> {
  signal.throwIfAborted()
  const app = await loadApplicationContext(tx, applicationId, signal)
  if (app === null) return
  const bound = new Set(effectiveBindings(app.typeBody, pack))
  const rules = pack.rules.filter(
    (r): r is ClockRule => r.kind === 'clock' && r.startEvent === event && bound.has(r.key),
  )
  const running = await tx
    .select({ ruleKey: clocks.ruleKey })
    .from(clocks)
    .where(and(eq(clocks.applicationId, applicationId), eq(clocks.status, 'running')))
  const runningKeys = new Set(running.map((c) => c.ruleKey))
  const holidays = packHolidayCalendar()
  for (const rule of rules) {
    if (runningKeys.has(rule.key)) continue
    const length = await resolveLength(tx, rule, app.facts, pack, signal)
    const input = {
      start: onDate,
      length: { unit: length.unit, value: length.value },
      direction: rule.direction,
      clockType: rule.clockType,
      holidays,
    }
    const due = computeDue(input)
    const packDue = computeDue({
      ...input,
      length: { unit: length.unit, value: length.packDefault },
    })
    await tx.insert(clocks).values({
      applicationId,
      ruleKey: rule.key,
      ruleVersion: rule.version,
      packVersion: pack.version,
      startEvent: event,
      startDate: onDate,
      lengthValue: length.value,
      lengthUnit: length.unit,
      countingMethod: describeCounting(input, due, PACK_COUNTING_CITATIONS),
      computedDue: due.due,
      currentDue: due.due,
      rolledFrom: due.rolledFrom,
      source: length.source,
      replacedDue: length.source === 'town_setting' ? packDue.due : null,
    })
  }
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
