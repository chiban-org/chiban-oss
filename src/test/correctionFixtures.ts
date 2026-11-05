import { ATTESTATION_TEXT } from '@packs/nh/starters/types'
import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { feeAssessments, projectParties } from '@/db/schema'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import type { Actor } from '@/features/auth/actor'
import { adoptStarter } from '@/features/config/adoptStarter'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { issueApplication } from '@/features/issuance/issueApplication'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld } from '@/test/applicationFixtures'
import { lineAllocation, submittedTrade, type TradeFixture } from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
export const ISSUED_AT = new Date('2027-03-02T17:00:00Z')
export const CORRECTED_AT = new Date('2027-03-09T15:00:00Z')

export interface IssuedPermit {
  trade: TradeFixture
  contractor: Actor
  contractorPartyId: string
  owner: Actor
}

export async function addPartyRow(
  db: Db,
  world: PermitWorld,
  party: { role: 'owner' | 'contractor' | 'agent' | 'applicant'; name: string; userId?: string },
): Promise<string> {
  const [row] = await db
    .insert(projectParties)
    .values({
      projectId: world.projectId,
      role: party.role,
      name: party.name,
      userId: party.userId ?? null,
      addedBy: world.admin.userId,
    })
    .returning({ id: projectParties.id })
  return row?.id ?? ''
}

async function payInFull(db: Db, trade: TradeFixture): Promise<void> {
  const [assessment] = await db
    .select({ totalCents: feeAssessments.totalCents })
    .from(feeAssessments)
    .where(eq(feeAssessments.id, trade.assessmentId))
  const amountCents = assessment?.totalCents ?? 0
  const paid = await recordCounterPayment(
    db,
    trade.world.staff,
    {
      method: 'cash',
      amountCents,
      tenderedCents: amountCents,
      payerName: 'Avery Stone',
      allocations: [lineAllocation(trade, amountCents)],
    },
    signal,
    ISSUED_AT,
  )
  if (!paid.ok) throw new AppError(ErrorIds.DB_INVARIANT, `payment failed: ${paid.error}`)
}

export async function issuedTrade(
  db: Db,
  world: PermitWorld,
  store: ObjectStore,
): Promise<TradeFixture> {
  const trade = await submittedTrade(db, world)
  await payInFull(db, trade)
  const issued = await issueApplication(
    db,
    world.staff,
    { applicationId: trade.applicationId },
    signal,
    { store, now: ISSUED_AT },
  )
  if (!issued.ok)
    throw new AppError(ErrorIds.DB_INVARIANT, `issue failed: ${JSON.stringify(issued.error)}`)
  return trade
}

export async function issuedTradePermit(
  db: Db,
  world: PermitWorld,
  store: ObjectStore,
): Promise<IssuedPermit> {
  const contractor = await staffActor(db, 'applicant')
  const owner = await staffActor(db, 'applicant')
  const contractorPartyId = await addPartyRow(db, world, {
    role: 'contractor',
    name: 'Volt Electric',
    userId: contractor.userId,
  })
  await addPartyRow(db, world, { role: 'owner', name: 'Robin Owner', userId: owner.userId })
  const trade = await issuedTrade(db, world, store)
  return { trade, contractor, contractorPartyId, owner }
}

export async function closedAtIssuance(
  db: Db,
  world: PermitWorld,
  store: ObjectStore,
): Promise<string> {
  const adopted = await adoptStarter(db, world.admin, 'nh.starter.street_address', signal)
  if (!adopted.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'street address starter failed')
  const made = await makeApplication(db, world, {}, ISSUED_AT, 'SA')
  const submitted = await submitApplication(
    db,
    world.staff,
    {
      applicationId: made.applicationId,
      values: { description: 'New cottage', private_road: 'Birch Lane' },
      attestation: { statementSha256: attestationHash(ATTESTATION_TEXT) },
    },
    signal,
    ISSUED_AT,
  )
  if (!submitted.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'street address submit failed')
  const issued = await issueApplication(
    db,
    world.staff,
    { applicationId: made.applicationId },
    signal,
    { store, now: ISSUED_AT },
  )
  if (!issued.ok)
    throw new AppError(ErrorIds.DB_INVARIANT, `issue failed: ${JSON.stringify(issued.error)}`)
  return made.applicationId
}
