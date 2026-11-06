import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { designateEnforcementOfficer } from '@/features/enforcement/designations'
import { recordFinding } from '@/features/enforcement/findings'
import { type EnforcementWorld, FIXTURE_NOW } from '@/test/enforcementFixtures'

const signal = new AbortController().signal

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }, what: string): T {
  if (!result.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, `${what} failed: ${JSON.stringify(result.error)}`)
  }
  return result.value
}

export async function intakeCase(
  db: Db,
  world: EnforcementWorld,
  location = '14 Birch Lane',
): Promise<{ caseId: string; number: string }> {
  return must(
    await openCase(db, world.staff, { locationText: location }, signal, FIXTURE_NOW),
    'open case',
  )
}

export async function investigatingCase(
  db: Db,
  world: EnforcementWorld,
  location?: string,
): Promise<{ caseId: string }> {
  const { caseId } = await intakeCase(db, world, location)
  must(
    await setCaseStatus(
      db,
      world.staff,
      { caseId, to: 'investigating', expectedRowVersion: 1 },
      signal,
      FIXTURE_NOW,
    ),
    'investigate',
  )
  return { caseId }
}

export async function caseWithFinding(
  db: Db,
  world: EnforcementWorld,
  location?: string,
): Promise<{ caseId: string; findingId: string }> {
  const { caseId } = await investigatingCase(db, world, location)
  const found = must(
    await recordFinding(
      db,
      world.staff,
      {
        caseId,
        provisionKind: 'zoning_ordinance',
        provisionRef: 'Zoning Ordinance Section 4.2',
        facts: 'A garage was built without a permit.',
        inspectionDate: '2027-02-20',
      },
      signal,
      FIXTURE_NOW,
    ),
    'finding',
  )
  return { caseId, findingId: found.findingId }
}

export async function designateStaff(db: Db, world: EnforcementWorld): Promise<void> {
  must(
    await designateEnforcementOfficer(
      db,
      world.admin,
      {
        userId: world.staff.userId,
        title: 'Code Enforcement Officer',
        adoptingAuthority: 'Select Board',
        adoptedOn: '2027-01-05',
      },
      signal,
    ),
    'designate',
  )
}
