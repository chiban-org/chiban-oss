import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { designateEnforcementOfficer } from '@/features/enforcement/designations'
import { recordFinding } from '@/features/enforcement/findings'
import { draftOrder, issueOrder } from '@/features/enforcement/orders'
import type { ObjectStore } from '@/features/storage/objectStore'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
export const FIXTURE_NOW = new Date('2027-02-26T15:00:00Z')

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
