import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { documents } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { getParcelHistory } from '@/features/parcels/parcelHistory'
import { linkRecordToParcel } from '@/features/parcels/recordLinks'
import { buildRecordTable } from '@/features/parcels/recordTable'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let submitted: string
let draft: string

async function addDocument(
  recordKind: string,
  recordId: string,
  docKind: 'attachment' | 'parcel_file' | 'application_snapshot',
  isPublic = false,
): Promise<string> {
  const [row] = await handle.db
    .insert(documents)
    .values({
      recordKind,
      recordId,
      title: `${docKind} file`,
      docKind,
      isPublic,
      createdByKind: 'system',
    })
    .returning({ id: documents.id })
  const id = row?.id ?? ''
  await handle.db.transaction((tx) =>
    linkRecordToParcel(
      tx,
      { recordKind: 'document', recordId: id, parcelId: world.parcelId },
      signal,
    ),
  )
  return id
}

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  submitted = (
    await makeApplication(handle.db, world, { state: 'submitted', receivedDate: '2027-03-01' })
  ).applicationId
  draft = (await makeApplication(handle.db, world)).applicationId
  await addDocument('application', submitted, 'application_snapshot')
  await addDocument('application', submitted, 'attachment', true)
  await addDocument('application', draft, 'attachment')
  await addDocument('parcel', world.parcelId, 'parcel_file')
  await addDocument('parcel', world.parcelId, 'attachment')
})
afterAll(async () => {
  await handle.drop()
})

async function tableFor(actor: Actor) {
  const history = await getParcelHistory(
    handle.db,
    world.parcelId,
    { kind: 'actor', actor },
    signal,
  )
  return { history, table: buildRecordTable(history, world.parcelId) }
}

describe('parcel records table visibility', () => {
  it.each([
    'staff',
    'records_custodian',
    'reviewer',
    'inspector',
    'finance',
  ] as const)('shows a %s every record and file they could see before, apart from parcel files', async (role) => {
    const { history, table } = await tableFor(await staffActor(handle.db, role))
    const before = history.own
      .filter((s) => s.owner?.kind !== 'parcel')
      .map((s) => s.recordId)
      .sort()
    const after = table.own.flatMap((r) => [r.recordId, ...r.files.map((f) => f.id)]).sort()
    expect(after).toEqual(before)
  })

  it('nests the submitted application’s files under it for full-record staff', async () => {
    const { table } = await tableFor(world.staff)
    const row = table.own.find((r) => r.recordId === submitted)
    expect(row?.files).toHaveLength(2)
    expect(row?.href).toBe(`/staff/applications/${submitted}`)
    expect(row?.dates.filed).toBe('2027-03-01')
    expect(table.own.some((r) => r.recordId === draft)).toBe(true)
  })

  it('gives a reviewer no draft and no record links, as before', async () => {
    const { table } = await tableFor(world.reviewer)
    expect(table.own.some((r) => r.recordId === draft)).toBe(false)
    const row = table.own.find((r) => r.recordId === submitted)
    expect(row?.href).toBeNull()
  })
})
