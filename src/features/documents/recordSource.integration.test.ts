import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { getParcelHistory } from '@/features/parcels/parcelHistory'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let store: ObjectStore
let sha256 = ''

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
  sha256 = (
    await storeGeneratedBytes(handle.db, store, pdfBytes('history'), 'application/pdf', signal)
  ).sha256
})
afterAll(async () => {
  await handle.drop()
})

async function attach(
  target: { kind: 'parcel' | 'application'; id: string },
  title: string,
  options: { isPublic: boolean; audiences: ('project_parties' | 'reviewers' | 'board')[] },
) {
  return await handle.db.transaction((tx) =>
    attachDocument(
      tx,
      world.staff,
      {
        target,
        title,
        docKind: target.kind === 'parcel' ? 'parcel_file' : 'attachment',
        file: { sha256, filename: `${title}.pdf`, contentType: 'application/pdf' },
        ...options,
        ...(target.kind === 'parcel' ? { seriesKey: 'nh.rs.blueprints_architectural' } : {}),
      },
      signal,
    ),
  )
}

const publicTitles = async () => {
  const history = await getParcelHistory(handle.db, world.parcelId, { kind: 'public' }, signal)
  return history.own.filter((r) => r.kind === 'document').map((r) => r.title)
}

describe('documents in parcel history', () => {
  it('public parcel history lists the public document and not the staff-only one', async () => {
    await attach({ kind: 'parcel', id: world.parcelId }, 'Recorded plat', {
      isPublic: true,
      audiences: ['project_parties'],
    })
    await attach({ kind: 'parcel', id: world.parcelId }, 'Internal note', {
      isPublic: false,
      audiences: [],
    })
    expect(await publicTitles()).toEqual(['Recorded plat'])
  })

  it('marks parcel files so the staff parcel page can list them only under Documents', async () => {
    const history = await getParcelHistory(handle.db, world.parcelId, { kind: 'public' }, signal)
    const files = history.own.filter((r) => r.kind === 'document')
    expect(files.length).toBeGreaterThan(0)
    expect(files.every((r) => r.parcelFile === true)).toBe(true)
  })

  it('applicant parcel history shows own party documents; the public view does not', async () => {
    const app = await makeApplication(handle.db, world)
    await attach({ kind: 'application', id: app.applicationId }, 'Applicant plan', {
      isPublic: false,
      audiences: ['project_parties'],
    })
    const mine = await getParcelHistory(
      handle.db,
      world.parcelId,
      { kind: 'actor', actor: world.applicant },
      signal,
    )
    expect(mine.own.filter((r) => r.kind === 'document').map((r) => r.title)).toContain(
      'Applicant plan',
    )
    expect(await publicTitles()).not.toContain('Applicant plan')
    const stranger = await staffActor(handle.db, 'applicant')
    const theirs = await getParcelHistory(
      handle.db,
      world.parcelId,
      { kind: 'actor', actor: stranger },
      signal,
    )
    expect(theirs.own.filter((r) => r.kind === 'document').map((r) => r.title)).not.toContain(
      'Applicant plan',
    )
  })

  it('parcel history for the public shows 3 of 40 documents when only 3 are public', async () => {
    for (let i = 0; i < 40; i += 1) {
      await attach({ kind: 'parcel', id: world.parcelId }, `Bulk ${i}`, {
        isPublic: i < 3,
        audiences: [],
      })
    }
    const bulk = (await publicTitles()).filter((t) => t.startsWith('Bulk'))
    expect(bulk).toHaveLength(3)
  })

  it('each summary links to the authorized download and shows no uploader', async () => {
    const history = await getParcelHistory(handle.db, world.parcelId, { kind: 'public' }, signal)
    const doc = history.own.find((r) => r.kind === 'document')
    expect(doc?.href).toMatch(/^\/api\/documents\/[0-9a-f-]{36}$/)
    expect(JSON.stringify(doc)).not.toContain(world.staff.userId)
  })
})
