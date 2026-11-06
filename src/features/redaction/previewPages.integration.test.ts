import * as mupdf from 'mupdf'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { loadEditorSource, renderEditorPage } from '@/features/redaction/previewPages'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const PAGES = 14
let handle: TestDb
let store: ObjectStore
let staff: Actor
let versionId: string

function longPdf(pages: number): Uint8Array<ArrayBuffer> {
  const doc = new mupdf.PDFDocument()
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([0, 0, 612, 792], 0, doc.newDictionary(), '')
    doc.insertPage(-1, page)
  }
  return new Uint8Array(doc.saveToBuffer('').asUint8Array())
}

beforeAll(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  const parcel = await makeParcel(handle.db, [])
  versionId = (
    await uploadAs(handle.db, store, staff, { kind: 'parcel', id: parcel }, longPdf(PAGES), {
      title: 'Long plan',
      filename: 'long-plan.pdf',
      seriesKey: 'nh.rs.correspondence_administrative',
    })
  ).versionId
})
afterAll(async () => {
  await handle.drop()
})

describe('redaction editor pages', () => {
  it('every page of a long PDF is offered, and a page past twelve renders', async () => {
    const source = await loadEditorSource(handle.db, store, versionId, signal)
    expect(source.ok && source.value.pages.map((p) => p.page)).toEqual(
      Array.from({ length: PAGES }, (_, i) => i + 1),
    )
    const rendered = await renderEditorPage(handle.db, store, versionId, PAGES, signal)
    expect(rendered.ok && [...rendered.value.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47])
    expect(await renderEditorPage(handle.db, store, versionId, PAGES + 1, signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })
})
