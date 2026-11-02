import { ATTESTATION_TEXT } from '@packs/nh/starters/types'
import { and, eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { feeAssessments } from '@/db/schema'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import type { AllocationInput } from '@/features/ledger/types'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'

const signal = new AbortController().signal

export interface TradeFixture {
  world: PermitWorld
  applicationId: string
  number: string
  assessmentId: string
  feeCode: string
}

export async function setupTradeWorld(db: Db): Promise<{ world: PermitWorld }> {
  const world = await setupPermitWorld(db, { starters: ['nh.starter.electrical'] })
  return { world }
}

export async function submittedTrade(
  db: Db,
  world: PermitWorld,
  now: Date = new Date('2027-03-02T15:00:00Z'),
  projectId: string = world.projectId,
): Promise<TradeFixture> {
  const made = await makeApplication(
    db,
    { ...world, projectId, applicant: world.staff },
    {},
    now,
    'EL',
  )
  const submitted = await submitApplication(
    db,
    world.staff,
    {
      applicationId: made.applicationId,
      values: { description: 'Panel upgrade', contractor_license_number: 'EL-1' },
      attestation: { statementSha256: attestationHash(ATTESTATION_TEXT) },
    },
    signal,
    now,
  )
  if (!submitted.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'trade submit failed', {
      error: JSON.stringify(submitted.error),
    })
  }
  const [assessment] = await db
    .select()
    .from(feeAssessments)
    .where(
      and(
        eq(feeAssessments.applicationId, made.applicationId),
        eq(feeAssessments.stage, 'at_intake'),
      ),
    )
  return {
    world,
    applicationId: made.applicationId,
    number: made.number,
    assessmentId: assessment?.id ?? '',
    feeCode: 'el',
  }
}

export function lineAllocation(trade: TradeFixture, amountCents: number): AllocationInput {
  return {
    targetKind: 'fee_assessment_line',
    applicationId: trade.applicationId,
    feeAssessmentId: trade.assessmentId,
    stage: 'at_intake',
    feeCode: trade.feeCode,
    amountCents,
  }
}
