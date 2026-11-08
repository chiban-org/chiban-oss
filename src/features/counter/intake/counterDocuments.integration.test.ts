import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { acceptWithoutDocument, requestWaiver } from '@/features/applications/documentItems'
import { startCounterIntake } from '@/features/counter/intake/startIntake'
import { submitCounterIntake } from '@/features/counter/intake/submitIntake'
import { saveDraftValues } from '@/features/portal/drafts'
import type { ObjectStore } from '@/features/storage/objectStore'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import {
  blockedKeys,
  FLOOR_PLANS,
  LANDSCAPING,
  PLOT_PLAN,
  SEPTIC,
} from '@/test/documentItemFixtures'
import { makeTestStore } from '@/test/objectStore'

const signal = new AbortController().signal
const NOW = new Date('2028-01-03T16:00:00Z')
let handle: TestDb
let world: PermitWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, {
    buildingType: { documents: [PLOT_PLAN, FLOOR_PLANS, LANDSCAPING, SEPTIC] },
  })
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

async function walkIn(): Promise<string> {
  const started = await startCounterIntake(
    handle.db,
    world.staff,
    {
      parcelId: world.parcelId,
      applicationTypeKey: 'BP',
      applicant: { name: 'Morgan Reyes' },
      now: NOW,
    },
    signal,
  )
  if (!started.ok) throw new Error(`start failed: ${JSON.stringify(started.error)}`)
  const saved = await saveDraftValues(
    handle.db,
    world.staff,
    { applicationId: started.value.applicationId, values: { classification: 'residential' } },
    signal,
  )
  if (!saved.ok) throw new Error('save failed')
  return started.value.applicationId
}

function submit(applicationId: string) {
  return submitCounterIntake(
    handle.db,
    world.staff,
    { applicationId, signedOnPaper: true, now: NOW },
    signal,
  )
}

describe('filing items for a walk-in building permit at the counter', () => {
  it('refuses submission until each filing item is uploaded, accepted, or waived', async () => {
    const applicationId = await walkIn()
    const refused = await submit(applicationId)
    expect(blockedKeys(refused)).toEqual(['documents.to_file'])
    expect(JSON.stringify(refused)).toContain(
      'Documents not provided: Plot plan; Floor plans and framing; Landscaping plan.',
    )

    await uploadAs(
      handle.db,
      store,
      world.staff,
      { kind: 'application', id: applicationId },
      pdfBytes('scanned plot plan'),
      { title: 'Plot plan', itemKey: 'plot_plan' },
    )
    const accepted = await acceptWithoutDocument(
      handle.db,
      world.staff,
      { applicationId, itemKey: 'floor_plans', reason: 'Plans are on file from the 2024 permit.' },
      signal,
    )
    expect(accepted.ok).toBe(true)
    expect(JSON.stringify(await submit(applicationId))).toContain(
      'Documents not provided: Landscaping plan.',
    )

    const waiver = await requestWaiver(
      handle.db,
      world.staff,
      { applicationId, itemKey: 'landscaping_plan', reason: 'No planting is proposed.' },
      signal,
    )
    expect(waiver.ok).toBe(true)
    expect(await submit(applicationId)).toEqual({ ok: true, value: { state: 'submitted' } })
  })

  it('lets the clerk scan a later-stage item while the walk-in is still a draft', async () => {
    const applicationId = await walkIn()
    const scanned = await uploadAs(
      handle.db,
      store,
      world.staff,
      { kind: 'application', id: applicationId },
      pdfBytes('scanned septic approval'),
      { title: 'State septic approval', itemKey: 'septic_approval' },
    )
    expect(scanned.documentId).toMatch(/^[0-9a-f-]{36}$/)
  })
})
