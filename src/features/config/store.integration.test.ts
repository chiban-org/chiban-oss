import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog } from '@/db/schema'
import { pinCurrent } from '@/features/config/bindings'
import { publishConfig } from '@/features/config/publish'
import { getPublished, getVersion, listVersions, saveDraft } from '@/features/config/store'
import {
  appTypeBody,
  FEE_BODY,
  FORM_BODY,
  publishBuildingSupport,
  saveAndPublish,
  statusOf,
} from '@/test/configFixtures'
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

describe('config store', () => {
  it('publish supersedes the previous version', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const v1 = await saveAndPublish(handle.db, admin, 'form', 'bp-form', FORM_BODY)
    const v2 = await saveAndPublish(handle.db, admin, 'form', 'bp-form', {
      ...FORM_BODY,
      label: 'Building permit form v2',
    })
    expect(await statusOf(handle.db, v1)).toBe('superseded')
    expect(await statusOf(handle.db, v2)).toBe('published')
    const current = await getPublished(handle.db, 'form', 'bp-form', signal)
    expect(current?.version).toBe(2)
    const versions = await listVersions(handle.db, 'form', 'bp-form', signal)
    expect(versions.map((v) => v.version)).toEqual([2, 1])
  })

  it('in-flight record keeps its pinned version', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await publishBuildingSupport(handle.db, admin)
    await saveAndPublish(handle.db, admin, 'application_type', 'BP', appTypeBody())
    const pins = await pinCurrent(handle.db, 'BP', signal)
    if (!pins.ok) throw new Error('not pinned')
    await saveAndPublish(handle.db, admin, 'form', 'bp-form', { ...FORM_BODY, label: 'Changed' })
    const pinned = await getVersion(handle.db, pins.value.form, signal)
    expect((pinned?.body as { label: string }).label).toBe('Building permit form')
    expect(pinned?.version).toBe(1)
  })

  it('pinCurrent is not_published for an unknown type', async () => {
    expect(await pinCurrent(handle.db, 'NOPE', signal)).toEqual({
      ok: false,
      error: 'not_published',
    })
  })

  it('admin can publish, staff gets forbidden', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const staff = await staffActor(handle.db, 'staff')
    expect(
      await saveDraft(handle.db, staff, { kind: 'form', key: 'x', body: FORM_BODY }, signal),
    ).toEqual({
      ok: false,
      error: 'forbidden',
    })
    const saved = await saveDraft(
      handle.db,
      admin,
      { kind: 'form', key: 'bp-form', body: FORM_BODY },
      signal,
    )
    if (!saved.ok) throw new Error('save failed')
    expect(await publishConfig(handle.db, staff, saved.value.versionId, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect((await publishConfig(handle.db, admin, saved.value.versionId, signal)).ok).toBe(true)
  })

  it('an invalid body returns issues and stores nothing', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const r = await saveDraft(
      handle.db,
      admin,
      { kind: 'fee_schedule', key: 'bad', body: { ...FEE_BODY, lines: [] } },
      signal,
    )
    expect(r.ok).toBe(false)
    if (!r.ok && typeof r.error === 'object') expect(r.error.invalid.length).toBeGreaterThan(0)
    expect(await listVersions(handle.db, 'fee_schedule', 'bad', signal)).toEqual([])
  })

  it('republishing a published version is not_draft', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const id = await saveAndPublish(handle.db, admin, 'form', 'bp-form', FORM_BODY)
    expect(await publishConfig(handle.db, admin, id, signal)).toEqual({
      ok: false,
      error: 'not_draft',
    })
  })

  it('saving twice before publishing keeps one draft', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveDraft(handle.db, admin, { kind: 'form', key: 'bp-form', body: FORM_BODY }, signal)
    await saveDraft(
      handle.db,
      admin,
      { kind: 'form', key: 'bp-form', body: { ...FORM_BODY, label: 'B' } },
      signal,
    )
    const versions = await listVersions(handle.db, 'form', 'bp-form', signal)
    expect(versions).toHaveLength(1)
    expect((versions[0]?.body as { label: string }).label).toBe('B')
  })

  it('every publish writes an audit row with before and after version', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveAndPublish(handle.db, admin, 'form', 'bp-form', FORM_BODY)
    await saveAndPublish(handle.db, admin, 'form', 'bp-form', { ...FORM_BODY, label: 'v2' })
    const rows = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'config.publish'))
    expect(rows).toHaveLength(2)
    const second = rows.find((r) => (r.after as { version: number }).version === 2)
    expect(second?.before).toMatchObject({ version: 1 })
  })
})
