import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adoptStarter } from '@/features/config/adoptStarter'
import { getEditorState, listKeysOfKind, summarizeKinds } from '@/features/config/settingsViews'
import { saveDraft } from '@/features/config/store'
import { FORM_BODY, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

describe('settings views', () => {
  it('summarizes every kind with its key count', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await adoptStarter(handle.db, admin, 'nh.starter.electrical', signal)
    const summary = await summarizeKinds(handle.db, signal)
    expect(summary.find((s) => s.kind === 'application_type')).toMatchObject({ keys: 1 })
    expect(summary.find((s) => s.kind === 'inspection_checklist')).toMatchObject({ keys: 2 })
    expect(summary.find((s) => s.kind === 'local_code_amendment')).toMatchObject({ keys: 0 })
    expect(summary).toHaveLength(12)
  })

  it('lists keys of a kind with published version and draft flag', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveAndPublish(handle.db, admin, 'form', 'a-form', FORM_BODY)
    await saveDraft(
      handle.db,
      admin,
      { kind: 'form', key: 'a-form', body: { ...FORM_BODY, label: 'Edited' } },
      signal,
    )
    await saveDraft(handle.db, admin, { kind: 'form', key: 'b-form', body: FORM_BODY }, signal)
    const keys = await listKeysOfKind(handle.db, 'form', signal)
    expect(keys).toEqual([
      { key: 'a-form', publishedVersion: 1, hasDraft: true },
      { key: 'b-form', publishedVersion: null, hasDraft: true },
    ])
  })

  it('editor state prefers the draft, then the published body, then a skeleton', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveAndPublish(handle.db, admin, 'form', 'a-form', FORM_BODY)
    const published = await getEditorState(handle.db, 'form', 'a-form', signal)
    expect((published.body as { label: string }).label).toBe('Building permit form')
    expect(published.versions).toMatchObject([
      {
        version: 1,
        status: 'published',
        publishedBy: admin.userId.length > 0 ? expect.any(String) : '',
      },
    ])
    await saveDraft(
      handle.db,
      admin,
      { kind: 'form', key: 'a-form', body: { ...FORM_BODY, label: 'Edited' } },
      signal,
    )
    const drafted = await getEditorState(handle.db, 'form', 'a-form', signal)
    expect((drafted.body as { label: string }).label).toBe('Edited')
    const fresh = await getEditorState(handle.db, 'form', 'brand-new', signal)
    expect(fresh.versions).toEqual([])
    expect(fresh.body).toMatchObject({ key: 'brand-new' })
  })
})
