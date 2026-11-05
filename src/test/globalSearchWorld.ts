import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import {
  complaints,
  enforcementOrders,
  ledgerAllocations,
  ledgerEntries,
  parcels,
  receipts,
  reviewAssignments,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { openCase } from '@/features/enforcement/cases'
import { logRequest } from '@/features/rtk/requests'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T15:00:00Z')

export const STREET = 'Juniper Hill Road'
export const OWNER = 'Quillfeather Family Trust'

export interface SearchWorld {
  world: PermitWorld
  inspector: Actor
  custodian: Actor
  boardMember: Actor
  assigned: { applicationId: string; number: string }
  unassigned: { applicationId: string; number: string }
  extraApplications: string[]
  caseId: string
  caseNumber: string
  orderNumber: string
  complaintNumber: string
  requestId: string
  requestNumber: string
  receiptId: string
  receiptNumber: string
}

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }, what: string): T {
  if (!result.ok)
    throw new AppError(ErrorIds.DB_INVARIANT, `${what} failed: ${JSON.stringify(result.error)}`)
  return result.value
}

async function makeCases(db: Db, world: PermitWorld) {
  const opened = []
  for (let n = 0; n < 7; n += 1) {
    opened.push(
      must(
        await openCase(
          db,
          world.staff,
          { locationText: `${n + 1} ${STREET}`, parcelId: world.parcelId },
          signal,
          NOW,
        ),
        'open case',
      ),
    )
  }
  const first = opened[0]
  if (first === undefined) throw new AppError(ErrorIds.DB_INVARIANT, 'no case opened')
  return first
}

async function makeOrderAndComplaint(db: Db, world: PermitWorld, caseId: string) {
  await db.insert(enforcementOrders).values({
    caseId,
    number: 'CD-2027-0042',
    ruleKey: 'nh.enf.cd_zoning',
    ruleVersion: 1,
    correctiveAction: 'Remove the shed.',
    draftedBy: world.staff.userId,
  })
  await db.insert(complaints).values({
    number: 'CP-2027-0042',
    caseId,
    channel: 'staff_entry',
    receivedOn: '2027-03-01',
    locationText: `1 ${STREET}`,
    descriptionOriginal: 'A shed was built.',
  })
}

async function makeReceipt(db: Db) {
  const [receipt] = await db
    .insert(receipts)
    .values({
      number: 'R-2027-000042',
      kind: 'payment',
      issuedAt: NOW,
      businessDate: '2027-03-02',
      payerName: 'Avery Stone',
      totalCents: 5000,
    })
    .returning({ id: receipts.id })
  if (receipt === undefined) throw new AppError(ErrorIds.DB_INVARIANT, 'no receipt')
  await db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        entryType: 'payment',
        method: 'cash',
        amountCents: 5000,
        postedAt: NOW,
        businessDate: '2027-03-02',
        receiptId: receipt.id,
        payerName: 'Avery Stone',
        actorKind: 'user',
      })
      .returning({ id: ledgerEntries.id })
    await tx
      .insert(ledgerAllocations)
      .values({ entryId: entry?.id ?? '', targetKind: 'overpayment', amountCents: 5000 })
  })
  return receipt.id
}

export async function setupSearchWorld(db: Db): Promise<SearchWorld> {
  const world = await setupPermitWorld(db)
  await db
    .update(parcels)
    .set({ siteAddress: `12 ${STREET}`, ownerName: OWNER })
    .where(eq(parcels.id, world.parcelId))
  const assigned = await makeApplication(db, world, { state: 'issued' })
  const unassigned = await makeApplication(db, world, { state: 'under_review' })
  const extraApplications = []
  for (let n = 0; n < 5; n += 1)
    extraApplications.push((await makeApplication(db, world, { state: 'submitted' })).number)
  await db.insert(reviewAssignments).values({
    applicationId: assigned.applicationId,
    reviewerUserId: world.reviewer.userId,
    assignedBy: world.staff.userId,
  })
  const firstCase = await makeCases(db, world)
  await makeOrderAndComplaint(db, world, firstCase.caseId)
  const request = must(
    await logRequest(
      db,
      world.staff,
      {
        receivedOn: '2027-03-01',
        receivedVia: 'email',
        requesterName: 'Juniper Neighbors Association',
        description: `Permits for 12 ${STREET}`,
      },
      signal,
      NOW,
    ),
    'log request',
  )
  return {
    world,
    inspector: await staffActor(db, 'inspector'),
    custodian: await staffActor(db, 'records_custodian'),
    boardMember: await staffActor(db, 'board_member'),
    assigned,
    unassigned,
    extraApplications,
    caseId: firstCase.caseId,
    caseNumber: firstCase.number,
    orderNumber: 'CD-2027-0042',
    complaintNumber: 'CP-2027-0042',
    requestId: request.requestId,
    requestNumber: request.number,
    receiptId: await makeReceipt(db),
    receiptNumber: 'R-2027-000042',
  }
}
