import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog } from '@/db/schema'
import { discardDraft } from '@/features/config/discard'
import { getPublished, listVersions, saveDraft } from '@/features/config/store'
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

describe('discard draft', () => {
  it('removes an unpublished draft and keeps the published version in force', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveAndPublish(handle.db, admin, 'form', 'bp-form', FORM_BODY)
    await saveDraft(
      handle.db,
      admin,
      { kind: 'form', key: 'bp-form', body: { ...FORM_BODY, label: 'Edited' } },
      signal,
    )
    const result = await discardDraft(handle.db, admin, { kind: 'form', key: 'bp-form' }, signal)
    expect(result).toEqual({ ok: true, value: { remaining: 1 } })
    const versions = await listVersions(handle.db, 'form', 'bp-form', signal)
    expect(versions.map((v) => v.status)).toEqual(['published'])
    expect((await getPublished(handle.db, 'form', 'bp-form', signal))?.version).toBe(1)
    const audits = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'config.discard_draft'))
    expect(audits).toHaveLength(1)
  })

  it('removes a never-published draft entirely', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveDraft(handle.db, admin, { kind: 'form', key: 'only', body: FORM_BODY }, signal)
    const result = await discardDraft(handle.db, admin, { kind: 'form', key: 'only' }, signal)
    expect(result).toEqual({ ok: true, value: { remaining: 0 } })
    expect(await listVersions(handle.db, 'form', 'only', signal)).toEqual([])
  })

  it('refuses when there is no draft', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveAndPublish(handle.db, admin, 'form', 'bp-form', FORM_BODY)
    const result = await discardDraft(handle.db, admin, { kind: 'form', key: 'bp-form' }, signal)
    expect(result).toEqual({ ok: false, error: 'no_draft' })
    expect(await listVersions(handle.db, 'form', 'bp-form', signal)).toHaveLength(1)
  })

  it('refuses a user without config.edit and leaves the draft', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const staff = await staffActor(handle.db, 'staff')
    await saveDraft(handle.db, admin, { kind: 'form', key: 'only', body: FORM_BODY }, signal)
    const result = await discardDraft(handle.db, staff, { kind: 'form', key: 'only' }, signal)
    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(await listVersions(handle.db, 'form', 'only', signal)).toHaveLength(1)
  })
})
