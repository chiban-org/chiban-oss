import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applicationDocumentLinks, applications } from '@/db/schema'
import {
  acceptWithoutDocument,
  linkDocument,
  requestWaiver,
  unlinkDocument,
} from '@/features/applications/documentItems'
import { lockApplication } from '@/features/applications/lockApplication'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { ITEMS } from '@/test/documentItemFixtures'
import { blockedOrSettled, holdOpen } from '@/test/lockWait'
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

function moveOnWhileHeld(applicationId: string) {
  return holdOpen(handle.db, async (tx) => {
    await lockApplication(tx, applicationId)
    await tx
      .update(applications)
      .set({ state: 'under_review', rowVersion: sql`${applications.rowVersion} + 1` })
      .where(eq(applications.id, applicationId))
  })
}

async function whileHeld<T>(applicationId: string, run: () => Promise<T>): Promise<T> {
  const held = await moveOnWhileHeld(applicationId)
  const pending = run()
  const outcome = await blockedOrSettled(handle.db, pending).finally(() => held.commit())
  expect(outcome).toBe('blocked')
  return await pending
}

async function plotPlanOn(applicationId: string): Promise<string> {
  const uploaded = await uploadAs(
    handle.db,
    store,
    world.applicant,
    { kind: 'application', id: applicationId },
    pdfBytes('plot plan'),
    { itemKey: 'plot_plan' },
  )
  return uploaded.documentId
}

describe('checklist changes while a transition holds the application', () => {
  it('waits for the transition, then refuses to unassign a filing item whose stage closed', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'submitted' })
    const documentId = await plotPlanOn(applicationId)
    const held = await moveOnWhileHeld(applicationId)
    const removing = unlinkDocument(
      handle.db,
      world.applicant,
      { applicationId, itemKey: 'plot_plan', documentId },
      signal,
    )
    const outcome = await blockedOrSettled(handle.db, removing).finally(() => held.commit())
    expect(outcome).toBe('blocked')
    expect(await removing).toEqual({ ok: false, error: 'stage_closed' })
    const links = await handle.db
      .select({ id: applicationDocumentLinks.id })
      .from(applicationDocumentLinks)
      .where(eq(applicationDocumentLinks.documentId, documentId))
    expect(links).toHaveLength(1)
  })

  it('waits for the transition before linking, accepting, or recording a waiver', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'submitted' })
    const documentId = await plotPlanOn(applicationId)
    const linked = await whileHeld(applicationId, () =>
      linkDocument(
        handle.db,
        world.applicant,
        { applicationId, itemKey: 'floor_plans', documentId },
        signal,
      ),
    )
    expect(linked).toEqual({ ok: false, error: 'stage_closed' })
    const accepted = await whileHeld(applicationId, () =>
      acceptWithoutDocument(
        handle.db,
        world.staff,
        { applicationId, itemKey: 'drainage_study', reason: 'Seen at the counter.' },
        signal,
      ),
    )
    expect(accepted.ok).toBe(true)
    const waived = await whileHeld(applicationId, () =>
      requestWaiver(
        handle.db,
        world.applicant,
        { applicationId, itemKey: 'landscaping_plan', reason: 'No planting.' },
        signal,
      ),
    )
    expect(waived).toEqual({ ok: false, error: 'stage_closed' })
  })
})
