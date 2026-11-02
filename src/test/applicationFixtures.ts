import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { createApplication } from '@/features/applications/createApplication'
import type { CoreState } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { adoptStarter } from '@/features/config/adoptStarter'
import { createProject } from '@/features/projects/projects'
import { appTypeBody, publishBuildingSupport, saveAndPublish } from '@/test/configFixtures'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal

export interface PermitWorld {
  admin: Actor
  staff: Actor
  reviewer: Actor
  applicant: Actor
  parcelId: string
  projectId: string
}

export interface WorldOptions {
  starters?: string[]
  buildingType?: Partial<ApplicationTypeBody>
}

export async function setupPermitWorld(db: Db, options: WorldOptions = {}): Promise<PermitWorld> {
  await seedParcelWorld(db)
  const admin = await staffActor(db, 'admin')
  await publishBuildingSupport(db, admin)
  await saveAndPublish(db, admin, 'application_type', 'BP', appTypeBody(options.buildingType))
  for (const starter of options.starters ?? []) {
    const adopted = await adoptStarter(db, admin, starter, signal)
    if (!adopted.ok) throw new Error(`starter ${starter} failed: ${JSON.stringify(adopted.error)}`)
  }
  const staff = await staffActor(db, 'staff')
  const reviewer = await staffActor(db, 'reviewer')
  const applicant = await staffActor(db, 'applicant')
  const parcelId = await makeParcel(db, [{ format: 'gis12', value: '007001000000' }])
  const project = await createProject(db, applicant, { parcelId, title: 'Garage addition' }, signal)
  if (!project.ok) throw new Error('project failed')
  return { admin, staff, reviewer, applicant, parcelId, projectId: project.value.projectId }
}

export type ApplicationPatch = Partial<Omit<typeof applications.$inferInsert, 'state'>> & {
  state?: CoreState
}

export interface MadeApplication {
  applicationId: string
  number: string
}

export async function makeApplication(
  db: Db,
  world: PermitWorld,
  patch: ApplicationPatch = {},
  now: Date = new Date('2027-03-02T15:00:00Z'),
  typeKey = 'BP',
): Promise<MadeApplication> {
  const made = await createApplication(
    db,
    world.applicant,
    { projectId: world.projectId, applicationTypeKey: typeKey },
    signal,
    now,
  )
  if (!made.ok) throw new Error(`application failed: ${made.error}`)
  if (Object.keys(patch).length > 0) {
    await db.update(applications).set(patch).where(eq(applications.id, made.value.applicationId))
  }
  return made.value
}
