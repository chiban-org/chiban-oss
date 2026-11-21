import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { loadCaseDetail } from '@/features/enforcement/caseDetail'
import { EVERY_CASE_ABILITY } from '@/features/enforcement/caseNextStep'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { applyCureProcedure, sendCureNotice } from '@/features/enforcement/cureNotices'
import { recordFinding } from '@/features/enforcement/findings'
import { planCaseWork } from '@/features/enforcement/workPlan'
import { type EnforcementWorld, FIXTURE_NOW } from '@/test/enforcementFixtures'
import { XX_CURE_RULE_KEY } from '@/test/packs/xx/cure'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal

export const CURE_NOW = new Date('2027-03-02T15:00:00Z')
export const CURE_SENT = '2027-03-01' as CivilDate
export const CURE_DUE = '2027-03-11' as CivilDate
export const CURE_OWNER = { name: 'Larkspur Family Trust', mailingAddress: '9 Fern Road, Vellmora' }
export const CURE_OCCUPANT = { name: 'Robin Renter', mailingAddress: '14 Birch Lane, Vellmora' }

function fail(what: string, error: string): never {
  throw new AppError(ErrorIds.DB_INVARIANT, `${what} failed: ${error}`)
}

export function cureHelpers(db: Db, world: EnforcementWorld) {
  async function addFinding(caseId: string, n: number): Promise<string> {
    const made = await recordFinding(
      db,
      world.staff,
      {
        caseId,
        provisionKind: 'zoning_ordinance',
        provisionRef: `Zoning Ordinance Section 4.${String(n + 1)}`,
        facts: 'Trees were cut inside the shoreland strip.',
        inspectionDate: '2027-02-20',
      },
      signal,
      FIXTURE_NOW,
    )
    if (!made.ok) fail('finding', made.error)
    return made.value.findingId
  }

  async function foundCase(count = 1): Promise<{ caseId: string; findingIds: string[] }> {
    const opened = await openCase(db, world.staff, { locationText: '14 Birch Lane' }, signal)
    if (!opened.ok) fail('open case', opened.error)
    const { caseId } = opened.value
    await setCaseStatus(
      db,
      world.staff,
      { caseId, to: 'investigating', expectedRowVersion: 1 },
      signal,
    )
    const findingIds: string[] = []
    for (let i = 0; i < count; i += 1) findingIds.push(await addFinding(caseId, i))
    return { caseId, findingIds }
  }

  async function chooseCure(caseId: string): Promise<void> {
    const applied = await applyCureProcedure(
      db,
      world.staff,
      { caseId, ruleKey: XX_CURE_RULE_KEY },
      signal,
    )
    if (!applied.ok) fail('cure procedure', applied.error)
  }

  function send(
    caseId: string,
    findingIds: string[],
    occupant: typeof CURE_OCCUPANT | 'none' = 'none',
  ) {
    return sendCureNotice(
      db,
      world.staff,
      {
        caseId,
        findingIds,
        owner: CURE_OWNER,
        occupant,
        sentOn: CURE_SENT,
        documentId: null,
      },
      signal,
      CURE_NOW,
    )
  }

  async function planOn(caseId: string, today: CivilDate) {
    const detail = await loadCaseDetail(db, world.staff, caseId, today, signal)
    if (!detail.ok) fail('case detail', detail.error)
    return planCaseWork(detail.value, { abilities: EVERY_CASE_ABILITY, responsible: null })
  }

  return { addFinding, foundCase, chooseCure, send, planOn }
}

export type CureHelpers = ReturnType<typeof cureHelpers>
