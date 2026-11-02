import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { applications, inspections, projectParties } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import type { ConfigPins } from '@/features/config/bindings'
import { getVersion } from '@/features/config/store'
import type { ChecklistBody } from '@/features/inspections/checklistSchema'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal

export const INSPECTION_NOW = new Date('2027-07-01T14:00:00Z')

export interface InspectionWorld {
  world: PermitWorld
  inspector: Actor
  otherInspector: Actor
  finance: Actor
  stranger: Actor
  trade: { applicationId: string; number: string }
  building: { applicationId: string; number: string }
}

export async function setupInspectionWorld(db: Db): Promise<InspectionWorld> {
  const world = await setupPermitWorld(db, {
    starters: ['nh.starter.electrical', 'nh.starter.building'],
  })
  const patch = { state: 'issued' as const, issuedOn: '2027-06-20' }
  const trade = await makeApplication(db, world, patch, INSPECTION_NOW, 'EL')
  const building = await makeApplication(db, world, patch, INSPECTION_NOW, 'BP')
  return {
    world,
    inspector: await staffActor(db, 'inspector'),
    otherInspector: await staffActor(db, 'inspector'),
    finance: await staffActor(db, 'finance'),
    stranger: await staffActor(db, 'applicant'),
    trade,
    building,
  }
}

export async function newIssuedPermit(
  db: Db,
  w: InspectionWorld,
  typeKey: 'EL' | 'BP',
): Promise<{ applicationId: string; number: string }> {
  return await makeApplication(
    db,
    w.world,
    { state: 'issued', issuedOn: '2027-06-20' },
    INSPECTION_NOW,
    typeKey,
  )
}

export async function checklistIdFor(
  db: Db,
  applicationId: string,
  inspectionType: string,
): Promise<string> {
  const [app] = await db.select().from(applications).where(eq(applications.id, applicationId))
  const pins = app?.configPins as ConfigPins
  for (const id of pins.checklists) {
    const version = await getVersion(db, id, signal)
    if ((version?.body as ChecklistBody).inspectionType === inspectionType) return id
  }
  throw new AppError(ErrorIds.DB_INVARIANT, 'no checklist pinned', { inspectionType })
}

export async function insertInspection(
  db: Db,
  applicationId: string,
  inspectionType: string,
  patch: Partial<typeof inspections.$inferInsert> = {},
): Promise<string> {
  const checklistVersionId = await checklistIdFor(db, applicationId, inspectionType)
  const [row] = await db
    .insert(inspections)
    .values({
      applicationId,
      checklistVersionId,
      inspectionType,
      isFinal: inspectionType === 'final',
      channel: 'phone',
      contactName: 'Pat Contact',
      ...patch,
    })
    .returning({ id: inspections.id })
  return row?.id ?? ''
}

export async function addUnclaimedContractor(
  db: Db,
  projectId: string,
  email: string,
): Promise<void> {
  await db.insert(projectParties).values({
    projectId,
    userId: null,
    email,
    name: 'Unclaimed Contractor',
    role: 'contractor',
    addedBy: projectId,
  })
}

export const civil = (s: string): CivilDate => s as CivilDate
