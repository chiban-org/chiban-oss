import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { issueList } from '@/features/abutters/issue'
import { labelsPdfResponse } from '@/features/abutters/labels/labelsAccess'
import { generateList } from '@/features/abutters/lists'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { findIsoDates, findRawKeys } from '@/test/leaks'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'
import { staffActor } from '@/test/parcels'
import { pdfText } from '@/test/pdfText'

const signal = new AbortController().signal
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
let handle: TestDb
let world: BoardWorld
let lw: ListWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  lw = await prepareListWorld(handle.db, world)
})
afterEach(async () => {
  await handle.drop()
})

async function draft() {
  const made = await generateList(
    handle.db,
    world.staff,
    { applicationId: lw.applicationId },
    signal,
    LIST_NOW,
  )
  if (!made.ok) throw new Error('generate failed')
  return made.value.listId
}

async function issued() {
  const listId = await draft()
  const done = await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)
  if (!done.ok) throw new Error('issue failed')
  return listId
}

describe('labels route access', () => {
  it('labels route for the seeded issued list returns a pdf', async () => {
    const listId = await issued()
    const response = await labelsPdfResponse(handle.db, world.staff, listId, null, signal)
    expect(response.status).toBe(200)
    expect(response.contentType).toBe('application/pdf')
    const bytes = response.body as Uint8Array
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
    const text = await pdfText(bytes)
    expect(text).toContain('Wren, Isolde')
    expect(text).toContain('PO Box 302')
  })

  it('the 5163 sheet can be requested', async () => {
    const listId = await issued()
    const response = await labelsPdfResponse(handle.db, world.staff, listId, 'avery_5163', signal)
    expect((await PDFDocument.load(response.body as Uint8Array)).getPageCount()).toBe(1)
  })

  it('the labels show no ISO date, enum key, or id', async () => {
    const text = await pdfText(
      (await labelsPdfResponse(handle.db, world.staff, await issued(), null, signal))
        .body as Uint8Array,
    )
    expect(findIsoDates(text)).toEqual([])
    expect(findRawKeys(text, ['abutter_owner', 'sealed_professional', 'verified_mail'])).toEqual([])
    expect(text).not.toMatch(UUID)
  })

  it('draft lists have no labels route', async () => {
    const listId = await draft()
    expect(await labelsPdfResponse(handle.db, world.staff, listId, null, signal)).toMatchObject({
      status: 404,
    })
  })

  it('a superseded list has no labels route', async () => {
    const first = await issued()
    await issued()
    expect(await labelsPdfResponse(handle.db, world.staff, first, null, signal)).toMatchObject({
      status: 404,
    })
  })

  it('a reviewer holding the id gets not found', async () => {
    const listId = await issued()
    expect(await labelsPdfResponse(handle.db, world.reviewer, listId, null, signal)).toMatchObject({
      status: 404,
    })
  })

  it('a signed-in public user holding the id gets not found', async () => {
    const listId = await issued()
    expect(await labelsPdfResponse(handle.db, world.applicant, listId, null, signal)).toMatchObject(
      { status: 404 },
    )
  })

  it('no session gets not found', async () => {
    const listId = await issued()
    expect(await labelsPdfResponse(handle.db, null, listId, null, signal)).toMatchObject({
      status: 404,
    })
  })

  it('an inspector without the abutters capability gets not found', async () => {
    const listId = await issued()
    const inspector = await staffActor(handle.db, 'inspector')
    expect(await labelsPdfResponse(handle.db, inspector, listId, null, signal)).toMatchObject({
      status: 404,
    })
  })

  it('an unknown id gets not found', async () => {
    expect(
      await labelsPdfResponse(
        handle.db,
        world.staff,
        '00000000-0000-4000-8000-000000000000',
        null,
        signal,
      ),
    ).toMatchObject({ status: 404 })
  })
})
