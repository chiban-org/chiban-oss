import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applicationDocumentLinks, applications } from '@/db/schema'
import {
  acceptWithoutDocument,
  linkDocument,
  requestWaiver,
  undoAcceptance,
  unlinkDocument,
} from '@/features/applications/documentItems'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { ITEMS, submitAs } from '@/test/documentItemFixtures'
import { makeTestStore } from '@/test/objectStore'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, { buildingType: { documents: ITEMS } })
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

async function stateOf(applicationId: string): Promise<string | undefined> {
  const [row] = await handle.db
    .select({ state: applications.state })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row?.state
}

function upload(applicationId: string, itemKey?: string) {
  return uploadAs(
    handle.db,
    store,
    world.applicant,
    { kind: 'application', id: applicationId },
    pdfBytes(`file ${itemKey ?? 'other'}`),
    itemKey === undefined ? {} : { itemKey },
  )
}

const MISSING_FILING = {
  key: 'documents.to_file',
  effective: 'blocked',
  outcome: {
    status: 'blocked',
    reason: 'Documents not provided: Plot plan; Floor plans and framing; Landscaping plan.',
  },
}

describe('filing documents per required item', () => {
  it('refuses submission while a filing item has nothing, and names the missing items', async () => {
    const { applicationId } = await makeApplication(handle.db, world)
    const refused = await submitAs(handle.db, world.applicant, applicationId)
    expect(refused).toMatchObject({ ok: false, error: { gateBlocked: [MISSING_FILING] } })
    expect(await stateOf(applicationId)).toBe('draft')
  })

  it('evaluates conditional items against the answers submitted with the form', async () => {
    const { applicationId } = await makeApplication(handle.db, world)
    const refused = await submitAs(handle.db, world.applicant, applicationId, {
      classification: 'nonresidential',
    })
    expect(JSON.stringify(refused)).toContain('Owner authorization')
  })

  it('links an upload to its item at finalize, and one file can satisfy two items', async () => {
    const { applicationId } = await makeApplication(handle.db, world)
    const plans = await upload(applicationId, 'plot_plan')
    const linked = await linkDocument(
      handle.db,
      world.applicant,
      { applicationId, itemKey: 'floor_plans', documentId: plans.documentId },
      signal,
    )
    expect(linked).toEqual({ ok: true, value: undefined })
    const links = await handle.db
      .select({ itemKey: applicationDocumentLinks.itemKey })
      .from(applicationDocumentLinks)
      .where(eq(applicationDocumentLinks.documentId, plans.documentId))
    expect(links.map((l) => l.itemKey).sort()).toEqual(['floor_plans', 'plot_plan'])
    const waived = await requestWaiver(
      handle.db,
      world.applicant,
      { applicationId, itemKey: 'landscaping_plan', reason: 'No new landscaping is proposed.' },
      signal,
    )
    expect(waived.ok).toBe(true)
    expect(await submitAs(handle.db, world.applicant, applicationId)).toEqual({
      ok: true,
      value: { state: 'submitted' },
    })
  })

  it('removing a link makes the item missing again but keeps the file on the record', async () => {
    const { applicationId } = await makeApplication(handle.db, world)
    const plans = await upload(applicationId, 'plot_plan')
    const removed = await unlinkDocument(
      handle.db,
      world.applicant,
      { applicationId, itemKey: 'plot_plan', documentId: plans.documentId },
      signal,
    )
    expect(removed.ok).toBe(true)
    const refused = await submitAs(handle.db, world.applicant, applicationId)
    expect(JSON.stringify(refused)).toContain('Plot plan')
  })

  it('refuses a waiver request on an item that is not waivable', async () => {
    const { applicationId } = await makeApplication(handle.db, world)
    const refused = await requestWaiver(
      handle.db,
      world.applicant,
      { applicationId, itemKey: 'plot_plan', reason: 'Please waive this.' },
      signal,
    )
    expect(refused).toEqual({ ok: false, error: 'not_waivable' })
  })

  it('refuses linking a document from another application or an unknown item', async () => {
    const first = await makeApplication(handle.db, world)
    const second = await makeApplication(handle.db, world)
    const other = await upload(second.applicationId)
    expect(
      await linkDocument(
        handle.db,
        world.applicant,
        { applicationId: first.applicationId, itemKey: 'plot_plan', documentId: other.documentId },
        signal,
      ),
    ).toEqual({ ok: false, error: 'document_not_found' })
    expect(
      await linkDocument(
        handle.db,
        world.applicant,
        { applicationId: first.applicationId, itemKey: 'nope', documentId: other.documentId },
        signal,
      ),
    ).toEqual({ ok: false, error: 'unknown_item' })
  })
})

describe('staff accepting an item without the document', () => {
  it('lets staff accept a missing item with a reason, which satisfies the filing check', async () => {
    const { applicationId } = await makeApplication(handle.db, world)
    await upload(applicationId, 'plot_plan')
    await upload(applicationId, 'landscaping_plan')
    const accepted = await acceptWithoutDocument(
      handle.db,
      world.staff,
      { applicationId, itemKey: 'floor_plans', reason: 'Plans are on file from permit BP-2026-4.' },
      signal,
    )
    expect(accepted.ok).toBe(true)
    expect((await submitAs(handle.db, world.applicant, applicationId)).ok).toBe(true)
  })

  it('refuses acceptance by the applicant, and undo makes the item missing again', async () => {
    const { applicationId } = await makeApplication(handle.db, world)
    const ref = { applicationId, itemKey: 'floor_plans' }
    expect(
      await acceptWithoutDocument(handle.db, world.applicant, { ...ref, reason: 'Mine.' }, signal),
    ).toEqual({ ok: false, error: 'forbidden' })
    await acceptWithoutDocument(handle.db, world.staff, { ...ref, reason: 'On file.' }, signal)
    expect((await undoAcceptance(handle.db, world.staff, ref, signal)).ok).toBe(true)
    const refused = await submitAs(handle.db, world.applicant, applicationId)
    expect(JSON.stringify(refused)).toContain('Floor plans and framing')
  })
})

describe('when an applicant can add a document for an item', () => {
  it('keeps a later-stage item open after review starts and closes the filing items', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'under_review' })
    const septic = await upload(applicationId, 'septic_approval')
    expect(septic.documentId).toMatch(/^[0-9a-f-]{36}$/)
    await expect(upload(applicationId, 'plot_plan')).rejects.toThrow('intent: forbidden')
    await expect(upload(applicationId)).rejects.toThrow('intent: forbidden')
  })
})
