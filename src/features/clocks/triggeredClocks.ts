import type { Tx } from '@/db/client'
import { loadApplicationContext } from '@/features/applications/context'
import { factsWithDeterminations } from '@/features/clocks/derivedFacts'
import {
  hearingDependentRulesForEvent,
  keysOnlyIfHearingScheduled,
  keysSatisfiedByInspection,
} from '@/features/clocks/ruleEngine'
import { clockStartedOn, createClock, markClockMet } from '@/features/clocks/startClocks'
import { effectiveBindings } from '@/features/config/bindings'
import { loadPack, type Pack } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

export async function startHearingScheduledClocks(
  tx: Tx,
  applicationId: string,
  signal: AbortSignal,
  pack: Pack = loadPack(),
): Promise<void> {
  signal.throwIfAborted()
  if (keysOnlyIfHearingScheduled(pack.rules).length === 0) return
  const app = await loadApplicationContext(tx, applicationId, signal)
  const acceptedOn = app?.completedDate ?? null
  if (app === null || acceptedOn === null) return
  const facts = await factsWithDeterminations(tx, applicationId, app.facts)
  const bound = new Set(effectiveBindings(app.typeBody, pack))
  const rules = hearingDependentRulesForEvent(pack.rules, 'application_accepted', bound, facts)
  for (const rule of rules) {
    if (await clockStartedOn(tx, applicationId, rule.key, acceptedOn)) continue
    await createClock(
      tx,
      { applicationId, rule, facts, event: rule.startEvent, onDate: acceptedOn, pack },
      signal,
    )
  }
}

export async function markHearingScheduledClocksMet(
  tx: Tx,
  applicationId: string,
  heldOn: CivilDate,
  signal: AbortSignal,
): Promise<void> {
  for (const key of keysOnlyIfHearingScheduled(loadPack().rules)) {
    await markClockMet(tx, applicationId, key, heldOn, signal)
  }
}

export async function markInspectionClocksMet(
  tx: Tx,
  applicationId: string,
  recordedOn: CivilDate,
  signal: AbortSignal,
): Promise<void> {
  for (const key of keysSatisfiedByInspection(loadPack().rules)) {
    await markClockMet(tx, applicationId, key, recordedOn, signal)
  }
}
