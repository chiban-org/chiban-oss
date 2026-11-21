import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { recordCounselOutcome, referToCounsel } from '@/features/enforcement/counsel'
import { placeDevelopmentHold } from '@/features/enforcement/developmentHolds'
import { recordFine } from '@/features/enforcement/fines'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { CURE_NOW, type CureHelpers, cureHelpers } from '@/test/cureFixtures'
import type { EnforcementWorld } from '@/test/enforcementFixtures'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal

export const HOLD_TYPE = 'BPX'
export const HOLD_LAPSED = '2027-03-12' as CivilDate
export const HOLD_NOW = new Date('2027-03-12T15:00:00Z')
export const HOLD_LATER = new Date('2027-04-01T15:00:00Z')
export const HOLD_COURT = 'Vellmora District Court'

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }, what: string): T {
  if (!result.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, `${what} failed: ${JSON.stringify(result.error)}`)
  }
  return result.value
}

export interface HoldWorld {
  permit: PermitWorld
  enforcement: EnforcementWorld
  cure: CureHelpers
}

export async function setupHoldWorld(
  db: Db,
  permit: PermitWorld,
  bindings: string[] = ['xx.bp.decision'],
): Promise<HoldWorld> {
  await saveAndPublish(
    db,
    permit.admin,
    'application_type',
    HOLD_TYPE,
    appTypeBody({
      key: HOLD_TYPE,
      prefix: 'BX',
      classification: 'xx.building_permit',
      bindings,
    }),
  )
  const enforcement: EnforcementWorld = {
    staff: permit.staff,
    admin: permit.admin,
    inspector: await staffActor(db, 'inspector'),
    finance: await staffActor(db, 'finance'),
  }
  return { permit, enforcement, cure: cureHelpers(db, enforcement) }
}

export function holdHelpers(db: Db, world: HoldWorld) {
  const staff: Actor = world.permit.staff

  async function noticedCase(
    parcelId: string | null = world.permit.parcelId,
  ): Promise<{ caseId: string; findingId: string }> {
    const opened = must(
      await openCase(
        db,
        staff,
        { ...(parcelId === null ? {} : { parcelId }), locationText: '14 Birch Lane' },
        signal,
      ),
      'open case',
    )
    must(
      await setCaseStatus(
        db,
        staff,
        { caseId: opened.caseId, to: 'investigating', expectedRowVersion: 1 },
        signal,
      ),
      'investigate',
    )
    const findingId = await world.cure.addFinding(opened.caseId, 0)
    await world.cure.chooseCure(opened.caseId)
    must(await world.cure.send(opened.caseId, [findingId]), 'cure notice')
    return { caseId: opened.caseId, findingId }
  }

  function place(caseId: string, placedOn: CivilDate = HOLD_LAPSED) {
    return placeDevelopmentHold(db, staff, { caseId, placedOn }, signal)
  }

  async function heldCase(): Promise<{ caseId: string; findingId: string; holdId: string }> {
    const noticed = await noticedCase()
    const placed = must(await place(noticed.caseId), 'place hold')
    return { ...noticed, holdId: placed.holdId }
  }

  async function issuedPermit(): Promise<string> {
    const made = await makeApplication(
      db,
      world.permit,
      { state: 'issued', issuedOn: '2027-03-05', decidedOn: '2027-03-04' },
      CURE_NOW,
      HOLD_TYPE,
    )
    return made.applicationId
  }

  async function unpaidFine(store: ObjectStore, caseId: string, amountCents: number) {
    const referral = must(
      await referToCounsel(
        db,
        store,
        staff,
        {
          caseId,
          counselName: 'Attorney Quill',
          purpose: 'penalty_action',
          referredOn: '2027-03-13',
        },
        signal,
        HOLD_LATER,
      ),
      'refer',
    )
    const outcome = must(
      await recordCounselOutcome(
        db,
        staff,
        {
          referralId: referral.referralId,
          kind: 'judgment_for_town',
          occurredOn: '2027-03-20',
          court: HOLD_COURT,
          docket: 'VD-2027-0042',
        },
        signal,
      ),
      'outcome',
    )
    const fine = must(
      await recordFine(
        db,
        world.enforcement.finance,
        {
          caseId,
          kind: 'civil_penalty',
          ruleKey: 'xx.enf.penalty',
          amountCents,
          imposedOn: '2027-03-20',
          court: HOLD_COURT,
          docket: 'VD-2027-0042',
          counselOutcomeId: outcome.outcomeId,
        },
        signal,
        HOLD_LATER,
      ),
      'fine',
    )
    return fine.fineId
  }

  async function payFine(fineId: string, amountCents: number): Promise<void> {
    must(
      await recordCounterPayment(
        db,
        world.enforcement.finance,
        {
          method: 'cash',
          amountCents,
          payerName: 'Larkspur Family Trust',
          allocations: [{ targetKind: 'fine', fineId, amountCents }],
        },
        signal,
        HOLD_LATER,
      ),
      'payment',
    )
  }

  return { noticedCase, place, heldCase, issuedPermit, unpaidFine, payFine }
}

export type HoldHelpers = ReturnType<typeof holdHelpers>
