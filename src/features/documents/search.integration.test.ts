import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { searchDocuments, searchPublicDocuments } from '@/features/documents/search'
import { createProject } from '@/features/projects/projects'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { staffActor } from '@/test/parcels'
import { addRedactedCopy, indexText, uploadText } from '@/test/searchFixtures'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let store: ObjectStore
let appRef: { kind: 'application'; id: string }
let rival: Actor
let rivalRef: { kind: 'application'; id: string }

const titles = (rows: { title: string }[]) => rows.map((r) => r.title)

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
  appRef = { kind: 'application', id: (await makeApplication(handle.db, world)).applicationId }
  rival = await staffActor(handle.db, 'applicant')
  const project = await createProject(
    handle.db,
    rival,
    { parcelId: world.parcelId, title: 'Rival' },
    signal,
  )
  if (!project.ok) throw new Error('project')
  rivalRef = {
    kind: 'application',
    id: (
      await makeApplication(handle.db, {
        ...world,
        projectId: project.value.projectId,
        applicant: rival,
      })
    ).applicationId,
  }
  const publicDoc = await uploadText(
    handle.db,
    store,
    world.applicant,
    appRef,
    'Contact the owner at 603-555-0142 about the garage addition',
    { title: 'Garage packet', publish: world.staff },
  )
  await addRedactedCopy(
    handle.db,
    store,
    world.staff,
    appRef,
    publicDoc.documentId,
    'Contact withheld about the garage addition',
  )
  await uploadText(
    handle.db,
    store,
    world.applicant,
    appRef,
    'Private septic design by Carol Engineer',
    { title: 'Septic design' },
  )
  await uploadText(handle.db, store, rival, rivalRef, 'Private septic design for the rival lot', {
    title: 'Rival septic',
  })
  await indexText(handle.db, store)
})
afterAll(async () => {
  await handle.drop()
})

describe('document search', () => {
  it('public search finds text present in the redacted copy', async () => {
    const hits = await searchPublicDocuments(handle.db, { q: 'garage addition' }, signal)
    expect(titles(hits)).toEqual(['Garage packet'])
    expect(hits[0]?.parcelId).toBe(world.parcelId)
    expect(hits[0]?.snippet.length).toBeGreaterThan(0)
  })

  it('public search never matches text that only the original contains', async () => {
    expect(await searchPublicDocuments(handle.db, { q: '555-0142' }, signal)).toEqual([])
    expect(await searchPublicDocuments(handle.db, { q: '603-555-0142' }, signal)).toEqual([])
  })

  it('staff search finds the original text', async () => {
    const hits = await searchDocuments(handle.db, world.staff, { q: '555-0142' }, signal)
    expect(titles(hits.rows)).toEqual(['Garage packet'])
  })

  it('public search ignores private documents', async () => {
    expect(await searchPublicDocuments(handle.db, { q: 'septic' }, signal)).toEqual([])
  })

  it("applicant search finds own private attachment, not another applicant's", async () => {
    const mine = await searchDocuments(handle.db, world.applicant, { q: 'septic' }, signal)
    expect(titles(mine.rows)).toEqual(['Septic design'])
    const theirs = await searchDocuments(handle.db, rival, { q: 'septic' }, signal)
    expect(titles(theirs.rows)).toEqual(['Rival septic'])
  })

  it('a party searching sees the original text of a document that is public with a redacted copy', async () => {
    const hits = await searchDocuments(handle.db, world.applicant, { q: '555-0142' }, signal)
    expect(titles(hits.rows)).toEqual(['Garage packet'])
  })

  it('public search for one character returns nothing', async () => {
    expect(await searchPublicDocuments(handle.db, { q: 'g' }, signal)).toEqual([])
  })

  it('a query with wildcard characters matches literally', async () => {
    expect(await searchPublicDocuments(handle.db, { q: '%%' }, signal)).toEqual([])
  })
})
