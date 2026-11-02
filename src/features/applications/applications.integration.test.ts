import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, parcelRecordLinks, projectParties } from '@/db/schema'
import { createApplication } from '@/features/applications/createApplication'
import { listApplicationsForViewer } from '@/features/applications/listForViewer'
import { getParcelHistory } from '@/features/parcels/parcelHistory'
import { addParty } from '@/features/projects/parties'
import { createProject } from '@/features/projects/projects'
import { FEE_BODY, publishBuildingType, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T15:00:00Z')
let handle: TestDb
let parcelId: string

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '007001000000' }])
  await publishBuildingType(handle.db, await staffActor(handle.db, 'admin'))
})
afterEach(async () => {
  await handle.drop()
})

async function newProject(actor: Awaited<ReturnType<typeof staffActor>>) {
  const r = await createProject(handle.db, actor, { parcelId, title: 'Garage addition' }, signal)
  if (!r.ok) throw new Error('project failed')
  return r.value.projectId
}

async function newApplication(
  actor: Awaited<ReturnType<typeof staffActor>>,
  projectId: string,
  now = NOW,
) {
  const r = await createApplication(
    handle.db,
    actor,
    { projectId, applicationTypeKey: 'BP' },
    signal,
    now,
  )
  if (!r.ok) throw new Error(`application failed: ${r.error}`)
  return r.value
}

describe('createApplication', () => {
  it('numbers run BP-2027-0001 then BP-2027-0002 and restart each year', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const projectId = await newProject(applicant)
    expect((await newApplication(applicant, projectId)).number).toBe('BP-2027-0001')
    expect((await newApplication(applicant, projectId)).number).toBe('BP-2027-0002')
    const nextYear = new Date('2028-01-05T15:00:00Z')
    expect((await newApplication(applicant, projectId, nextYear)).number).toBe('BP-2028-0001')
  })

  it('numbers use the town year, so New Year in UTC is still last year in New Hampshire', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const projectId = await newProject(applicant)
    const eve = new Date('2028-01-01T03:00:00Z')
    expect((await newApplication(applicant, projectId, eve)).number).toBe('BP-2027-0001')
  })

  it('concurrent creations never repeat a number', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const projectId = await newProject(applicant)
    const made = await Promise.all(
      Array.from({ length: 8 }, () => newApplication(applicant, projectId)),
    )
    expect(new Set(made.map((m) => m.number)).size).toBe(8)
  })

  it('application links to its parcel in parcel_record_links and pins configuration', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const projectId = await newProject(applicant)
    const { applicationId } = await newApplication(applicant, projectId)
    const links = await handle.db
      .select()
      .from(parcelRecordLinks)
      .where(eq(parcelRecordLinks.recordId, applicationId))
    expect(links).toMatchObject([{ recordKind: 'application', parcelId, status: 'linked' }])
    const [app] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
    expect(app).toMatchObject({ state: 'draft', rowVersion: 1 })
    expect(Object.keys(app?.configPins as object)).toEqual(
      expect.arrayContaining(['applicationType', 'form', 'feeSchedule']),
    )
  })

  it('an applicant who is not a party is forbidden, and an unpublished type is not_published', async () => {
    const owner = await staffActor(handle.db, 'applicant')
    const stranger = await staffActor(handle.db, 'applicant')
    const projectId = await newProject(owner)
    expect(
      await createApplication(
        handle.db,
        stranger,
        { projectId, applicationTypeKey: 'BP' },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
    expect(
      await createApplication(
        handle.db,
        owner,
        { projectId, applicationTypeKey: 'ZZ' },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'not_published' })
  })
})

describe('createApplication configuration check', () => {
  it('refuses to pin a fee schedule that names a field the published form no longer has', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const admin = await staffActor(handle.db, 'admin')
    const projectId = await newProject(applicant)
    await saveAndPublish(handle.db, admin, 'fee_schedule', 'bp-fees', {
      ...FEE_BODY,
      lines: [
        {
          ...FEE_BODY.lines[0],
          expr: { op: 'per_unit', source: { kind: 'field', field: 'ghost' }, centsPerUnit: 1 },
        },
      ],
    })
    expect(
      await createApplication(
        handle.db,
        applicant,
        { projectId, applicationTypeKey: 'BP' },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'config_inconsistent' })
  })
})

describe('listApplicationsForViewer', () => {
  it('applicant sees 2 of 30 applications with limit 25 and no next cursor', async () => {
    const other = await staffActor(handle.db, 'applicant')
    const mine = await staffActor(handle.db, 'applicant')
    const otherProject = await newProject(other)
    for (let i = 0; i < 28; i += 1) await newApplication(other, otherProject)
    const myProject = await newProject(mine)
    await newApplication(mine, myProject)
    await newApplication(mine, myProject)
    const page = await listApplicationsForViewer(handle.db, mine, { limit: 25 }, signal)
    expect(page.rows).toHaveLength(2)
    expect(page.nextCursor).toBeNull()
  })

  it('staff sees all rows and pages through them with a cursor', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const staff = await staffActor(handle.db, 'staff')
    const projectId = await newProject(applicant)
    for (let i = 0; i < 5; i += 1) await newApplication(applicant, projectId)
    const first = await listApplicationsForViewer(handle.db, staff, { limit: 3 }, signal)
    expect(first.rows).toHaveLength(3)
    expect(first.nextCursor).not.toBeNull()
    const second = await listApplicationsForViewer(
      handle.db,
      staff,
      { limit: 3, cursor: first.nextCursor ?? undefined },
      signal,
    )
    expect(second.rows).toHaveLength(2)
    expect(second.nextCursor).toBeNull()
    const ids = new Set([...first.rows, ...second.rows].map((r) => r.id))
    expect(ids.size).toBe(5)
  })

  it('unclaimed contractor email sees nothing', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const contractor = await staffActor(handle.db, 'contractor')
    const projectId = await newProject(applicant)
    await newApplication(applicant, projectId)
    await addParty(
      handle.db,
      applicant,
      { projectId, role: 'contractor', name: 'Pat Builder', email: 'pat@alderpond.example' },
      signal,
    )
    const page = await listApplicationsForViewer(handle.db, contractor, { limit: 25 }, signal)
    expect(page.rows).toEqual([])
  })

  it('a contractor whose user is linked to the party sees the project, until removed', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const contractor = await staffActor(handle.db, 'contractor')
    const projectId = await newProject(applicant)
    await newApplication(applicant, projectId)
    const added = await addParty(
      handle.db,
      applicant,
      { projectId, role: 'contractor', name: 'Pat Builder', userId: contractor.userId },
      signal,
    )
    if (!added.ok) throw new Error('add failed')
    expect(
      (await listApplicationsForViewer(handle.db, contractor, { limit: 25 }, signal)).rows,
    ).toHaveLength(1)
    await handle.db
      .update(projectParties)
      .set({ removedAt: new Date() })
      .where(eq(projectParties.id, added.value.partyId))
    expect(
      (await listApplicationsForViewer(handle.db, contractor, { limit: 25 }, signal)).rows,
    ).toEqual([])
  })

  it('unassigned reviewer sees nothing', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const reviewer = await staffActor(handle.db, 'reviewer')
    const projectId = await newProject(applicant)
    await newApplication(applicant, projectId)
    const page = await listApplicationsForViewer(handle.db, reviewer, { limit: 25 }, signal)
    expect(page.rows).toEqual([])
  })
})

describe('application record source', () => {
  it('public parcel history shows a submitted application without party names and hides drafts', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const projectId = await newProject(applicant)
    const draft = await newApplication(applicant, projectId)
    const submitted = await newApplication(applicant, projectId)
    await handle.db
      .update(applications)
      .set({ state: 'submitted', receivedDate: '2027-03-01' })
      .where(eq(applications.id, submitted.applicationId))
    const history = await getParcelHistory(handle.db, parcelId, { kind: 'public' }, signal)
    expect(history.own.map((r) => r.number)).toEqual([submitted.number])
    expect(history.own.map((r) => r.number)).not.toContain(draft.number)
    expect(history.own[0]).toMatchObject({
      kind: 'application',
      title: 'Building permit',
      status: { label: 'Submitted' },
      date: '2027-03-01',
      href: null,
    })
    expect(JSON.stringify(history)).not.toMatch(/User \d|Garage|@alderpond/)
  })

  it('suspended shows the RSA 676:6 label from the pack rule', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const projectId = await newProject(applicant)
    const app = await newApplication(applicant, projectId)
    await handle.db
      .update(applications)
      .set({ state: 'suspended', receivedDate: '2027-03-01', issuedOn: '2027-03-15' })
      .where(eq(applications.id, app.applicationId))
    const history = await getParcelHistory(handle.db, parcelId, { kind: 'public' }, signal)
    expect(history.own[0]?.status.label).toBe('Suspended by appeal (RSA 676:6)')
    expect(history.own[0]?.date).toBe('2027-03-15')
  })

  it('staff see drafts with a link to the staff application page', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const staff = await staffActor(handle.db, 'staff')
    const projectId = await newProject(applicant)
    const app = await newApplication(applicant, projectId)
    const history = await getParcelHistory(
      handle.db,
      parcelId,
      { kind: 'actor', actor: staff },
      signal,
    )
    expect(history.own[0]?.href).toBe(`/staff/applications/${app.applicationId}`)
  })
})
