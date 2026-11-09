import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, parcelIdFormats } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import {
  addIdFormat,
  chooseDisplayFormat,
  deleteIdFormat,
  editIdFormat,
  listIdFormats,
} from '@/features/parcels/idFormatAdmin'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let admin: Actor
let staff: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  staff = await staffActor(handle.db, 'staff')
})
afterEach(async () => {
  await handle.drop()
})

const TOWN_ID = {
  key: 'town_pid',
  label: 'Town parcel ID',
  kind: 'free_text' as const,
  width: null,
}

async function rowOf(key: string) {
  const [row] = await handle.db.select().from(parcelIdFormats).where(eq(parcelIdFormats.key, key))
  return row
}

describe('parcel ID formats on a real install', () => {
  it('lists the pack defaults with their alias counts', async () => {
    await makeParcel(handle.db, [{ format: 'gis12', value: '007001000000' }])
    const listed = await listIdFormats(handle.db, admin, signal)
    if (!listed.ok) throw new Error(listed.error)
    expect(listed.value.map((r) => [r.key, r.width, r.isDisplay, r.aliasCount, r.inUse])).toEqual([
      ['cama15', 15, false, 0, false],
      ['gis12', 12, true, 1, true],
    ])
  })

  it('refuses everyone without the settings capability', async () => {
    expect(await listIdFormats(handle.db, staff, signal)).toEqual({ ok: false, error: 'forbidden' })
    expect(await addIdFormat(handle.db, staff, TOWN_ID, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('adds a format, audits it, and refuses a repeated key', async () => {
    expect(
      (await addIdFormat(handle.db, admin, { ...TOWN_ID, label: ' Town ID ' }, signal)).ok,
    ).toBe(true)
    expect(await rowOf('town_pid')).toMatchObject({
      label: 'Town ID',
      kind: 'free_text',
      isDisplay: false,
    })
    const audits = await handle.db.select().from(auditLog).where(eq(auditLog.entityId, 'town_pid'))
    expect(audits.map((a) => a.action)).toEqual(['parcel_id_format.add'])
    expect(await addIdFormat(handle.db, admin, TOWN_ID, signal)).toEqual({
      ok: false,
      error: 'key_taken',
    })
  })

  it('makes the first format ever added the display format', async () => {
    await handle.db.delete(parcelIdFormats)
    await addIdFormat(handle.db, admin, TOWN_ID, signal)
    expect((await rowOf('town_pid'))?.isDisplay).toBe(true)
  })

  it('edits label, kind and width of an unused format', async () => {
    const edited = await editIdFormat(
      handle.db,
      admin,
      { key: 'cama15', label: 'Assessor number', kind: 'digits', width: 18 },
      signal,
    )
    expect(edited.ok).toBe(true)
    expect(await rowOf('cama15')).toMatchObject({ label: 'Assessor number', width: 18 })
  })

  it('blocks narrowing a format that aliases already use and says how many', async () => {
    await makeParcel(handle.db, [{ format: 'gis12', value: '007001000000' }])
    await makeParcel(handle.db, [{ format: 'gis12', value: '052002000000' }])
    const narrowed = await editIdFormat(
      handle.db,
      admin,
      { key: 'gis12', label: 'Map-lot ID', kind: 'digits', width: 10 },
      signal,
    )
    expect(narrowed).toEqual({ ok: false, error: { narrows: 2 } })
    expect((await rowOf('gis12'))?.width).toBe(12)
  })

  it('blocks switching a used format from free text to digits only when a value is not digits', async () => {
    await handle.db
      .insert(parcelIdFormats)
      .values({ key: 'loose', label: 'Loose', kind: 'free_text' })
    await makeParcel(handle.db, [{ format: 'loose', value: 'A-12' }])
    expect(
      await editIdFormat(
        handle.db,
        admin,
        { key: 'loose', label: 'Loose', kind: 'digits', width: null },
        signal,
      ),
    ).toEqual({ ok: false, error: { narrows: 1 } })
  })

  it('allows widening a used format to free text', async () => {
    await makeParcel(handle.db, [{ format: 'gis12', value: '007001000000' }])
    const widened = await editIdFormat(
      handle.db,
      admin,
      { key: 'gis12', label: 'Map-lot ID', kind: 'free_text', width: null },
      signal,
    )
    expect(widened.ok).toBe(true)
  })

  it('moves the display choice in one step', async () => {
    expect((await chooseDisplayFormat(handle.db, admin, { key: 'cama15' }, signal)).ok).toBe(true)
    expect((await rowOf('cama15'))?.isDisplay).toBe(true)
    expect((await rowOf('gis12'))?.isDisplay).toBe(false)
    expect(await chooseDisplayFormat(handle.db, admin, { key: 'nope' }, signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('deletes an unused format but not the display format or one that aliases use', async () => {
    await addIdFormat(handle.db, admin, TOWN_ID, signal)
    expect((await deleteIdFormat(handle.db, admin, { key: 'town_pid' }, signal)).ok).toBe(true)
    expect(await rowOf('town_pid')).toBeUndefined()
    expect(await deleteIdFormat(handle.db, admin, { key: 'gis12' }, signal)).toEqual({
      ok: false,
      error: 'is_display',
    })
    await makeParcel(handle.db, [{ format: 'cama15', value: '007001000000000' }])
    expect(await deleteIdFormat(handle.db, admin, { key: 'cama15' }, signal)).toEqual({
      ok: false,
      error: 'in_use',
    })
  })
})
