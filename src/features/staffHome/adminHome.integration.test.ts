import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { saveDraft } from '@/features/config/store'
import { loadAdminSection } from '@/features/staffHome/adminHome'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { FORM_BODY } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

describe('the System section of Today', () => {
  it('opens the draft count on the list filtered to the drafts, so the rows match the count', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveDraft(handle.db, admin, { kind: 'form', key: 'a-form', body: FORM_BODY }, signal)
    const section = await loadAdminSection({
      db: handle.db,
      actor: admin,
      viewer: await loadNavViewer(handle.db, admin, signal),
      today: '2026-11-05',
      signal,
    })
    const row = section?.rows.find((r) => r.label.endsWith('drafts not yet published'))
    expect(row?.count).toBe(1)
    expect(row?.href).toBe('/staff/settings/form?draft=draft')
  })
})
