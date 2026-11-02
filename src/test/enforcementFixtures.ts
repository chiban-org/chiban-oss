import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { recordCourtStep } from '@/features/enforcement/courtSteps'
import { designateEnforcementOfficer } from '@/features/enforcement/designations'
import { recordFinding } from '@/features/enforcement/findings'
import { draftOrder, issueOrder } from '@/features/enforcement/orders'
import { listRecipient, recordRoleCheck, recordServiceEvent } from '@/features/enforcement/service'
import type { ObjectStore } from '@/features/storage/objectStore'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
export const FIXTURE_NOW = new Date('2027-02-26T15:00:00Z')
export const SERVICE_CLOCK = new Date('2027-12-31T15:00:00Z')

export interface EnforcementWorld {
  staff: Actor
  admin: Actor
  inspector: Actor
  finance: Actor
}

export async function setupEnforcementWorld(db: Db): Promise<EnforcementWorld> {
  await seedParcelWorld(db)
  return {
    staff: await staffActor(db, 'staff'),
    admin: await staffActor(db, 'admin'),
    inspector: await staffActor(db, 'inspector'),
    finance: await staffActor(db, 'finance'),
  }
}

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }, what: string): T {
  if (!result.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, `${what} failed: ${JSON.stringify(result.error)}`)
  }
  return result.value
}

export interface IssuedOrder {
  caseId: string
  findingId: string
  orderId: string
  number: string
  issuedBy: Actor
}

export interface IssueOptions {
  issuedOn?: string
  issuer?: Actor
  location?: string
  provisionKind?: 'zoning_ordinance' | 'building_code'
  skipDesignation?: boolean
}

export async function issuedOrder(
  db: Db,
  store: ObjectStore,
  world: EnforcementWorld,
  options: IssueOptions = {},
): Promise<IssuedOrder> {
  const issuer = options.issuer ?? world.staff
  const issuedOn = options.issuedOn ?? '2027-02-26'
  const opened = must(
    await openCase(
      db,
      world.staff,
      { locationText: options.location ?? '14 Birch Lane' },
      signal,
      FIXTURE_NOW,
    ),
    'open case',
  )
  must(
    await setCaseStatus(
      db,
      world.staff,
      { caseId: opened.caseId, to: 'investigating', expectedRowVersion: 1 },
      signal,
      FIXTURE_NOW,
    ),
    'investigate',
  )
  const finding = must(
    await recordFinding(
      db,
      world.staff,
      {
        caseId: opened.caseId,
        provisionKind: options.provisionKind ?? 'zoning_ordinance',
        provisionRef: 'Zoning Ordinance Section 4.2',
        facts: 'A garage was built without a permit.',
        inspectionDate: '2027-02-20',
      },
      signal,
      FIXTURE_NOW,
    ),
    'finding',
  )
  if (options.skipDesignation !== true) {
    must(
      await designateEnforcementOfficer(
        db,
        world.admin,
        {
          userId: issuer.userId,
          title: 'Code Enforcement Officer',
          adoptingAuthority: 'Select Board',
          adoptedOn: '2027-01-05',
        },
        signal,
      ),
      'designate',
    )
  }
  const drafted = must(
    await draftOrder(
      db,
      world.staff,
      {
        caseId: opened.caseId,
        findingIds: [finding.findingId],
        correctiveAction: 'Remove the garage or apply for a permit.',
        correctiveDeadline: '2027-04-15',
        ceaseImmediately: false,
      },
      signal,
      FIXTURE_NOW,
    ),
    'draft',
  )
  if (options.skipDesignation === true) {
    return {
      caseId: opened.caseId,
      findingId: finding.findingId,
      orderId: drafted.orderId,
      number: drafted.number,
      issuedBy: issuer,
    }
  }
  must(
    await issueOrder(
      db,
      store,
      issuer,
      { orderId: drafted.orderId, issuedOn, expectedRowVersion: 1 },
      signal,
      FIXTURE_NOW,
    ),
    'issue',
  )
  return {
    caseId: opened.caseId,
    findingId: finding.findingId,
    orderId: drafted.orderId,
    number: drafted.number,
    issuedBy: issuer,
  }
}

export async function uploadProof(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  caseId: string,
  title = 'Return of service',
  docKind: 'service_proof' | 'court_document' | 'enforcement_photo' = 'service_proof',
): Promise<string> {
  const up = await uploadAs(
    db,
    store,
    actor,
    { kind: 'enforcement_case', id: caseId },
    pdfBytes(`${title}-${Math.random()}`),
    { title, docKind },
  )
  return up.documentId
}

export interface ServedOrder extends IssuedOrder {
  ownerId: string
}

export async function completeService(
  db: Db,
  store: ObjectStore,
  world: EnforcementWorld,
  order: IssuedOrder,
  servedOn: string,
): Promise<ServedOrder> {
  const owner = must(
    await listRecipient(
      db,
      world.staff,
      {
        orderId: order.orderId,
        role: 'record_owner',
        name: 'Pat Owner',
        address: '14 Birch Lane',
        source: 'CAMA owner',
      },
      signal,
    ),
    'owner',
  )
  must(
    await recordRoleCheck(
      db,
      world.staff,
      {
        orderId: order.orderId,
        role: 'taxpayer',
        outcome: 'same_as_owner',
        basis: 'Tax bill goes to the owner',
        checkedOn: servedOn,
      },
      signal,
    ),
    'taxpayer',
  )
  for (const role of ['occupying_tenant', 'person_in_control', 'mortgagee_of_record'] as const) {
    must(
      await recordRoleCheck(
        db,
        world.staff,
        {
          orderId: order.orderId,
          role,
          outcome: 'none_exist',
          basis: 'Registry search on file',
          checkedOn: servedOn,
        },
        signal,
      ),
      role,
    )
  }
  must(
    await recordServiceEvent(
      db,
      world.staff,
      {
        orderId: order.orderId,
        recipientId: owner.recipientId,
        method: 'in_hand',
        servedOn,
        serverName: 'Sheriff Dale',
        serverRole: 'sheriff',
        proofDocumentId: await uploadProof(db, store, world.staff, order.caseId),
      },
      signal,
      SERVICE_CLOCK,
    ),
    'service',
  )
  return { ...order, ownerId: owner.recipientId }
}

export type StepKind = 'filed_with_clerk' | 'motion_to_enforce' | 'judgment'

export function makeStepper(
  db: Db,
  store: ObjectStore,
  world: EnforcementWorld,
  order: IssuedOrder,
  now: Date,
) {
  return async (
    kind: StepKind,
    occurredOn: string,
    extra: Partial<Parameters<typeof recordCourtStep>[2]> = {},
  ) =>
    await recordCourtStep(
      db,
      world.staff,
      {
        orderId: order.orderId,
        kind,
        occurredOn,
        court: 'District Court, Alder Pond Division',
        docket: '2027-CV-0042',
        documentId: await uploadProof(
          db,
          store,
          world.staff,
          order.caseId,
          'Court filing',
          'court_document',
        ),
        ...extra,
      },
      signal,
      now,
    )
}

export async function judgmentFor(
  db: Db,
  store: ObjectStore,
  world: EnforcementWorld,
  order: IssuedOrder,
  outcome: 'affirmed' | 'modified' | 'annulled' = 'affirmed',
): Promise<string> {
  const later = new Date('2027-07-20T15:00:00Z')
  const step = makeStepper(db, store, world, order, later)
  await completeService(db, store, world, order, '2027-03-01')
  must(await step('filed_with_clerk', '2027-03-10'), 'file')
  must(await step('motion_to_enforce', '2027-03-23'), 'motion')
  const judgment = must(
    await step('judgment', '2027-06-18', { judgmentOutcome: outcome }),
    'judgment',
  )
  return judgment.stepId
}
