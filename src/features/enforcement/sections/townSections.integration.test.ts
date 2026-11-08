import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, townSections } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import {
  addTownSection,
  editTownSection,
  retireTownSection,
} from '@/features/enforcement/sections/townSections'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let admin: Actor
let staff: Actor

const SETBACKS = {
  provisionKind: 'zoning_ordinance' as const,
  reference: 'Zoning Ordinance Section 4.2',
  title: 'accessory structure setbacks',
}

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  staff = await staffActor(handle.db, 'staff')
})
afterEach(async () => {
  await handle.drop()
})

async function add(input = SETBACKS) {
  const made = await addTownSection(handle.db, admin, input, signal)
  if (!made.ok) throw new Error(made.error)
  return made.value.sectionId
}

async function rowOf(id: string) {
  const [row] = await handle.db.select().from(townSections).where(eq(townSections.id, id))
  return row
}

describe('the town section list', () => {
  it('adds a section with a trimmed reference and audits it', async () => {
    const id = await add({ ...SETBACKS, reference: '  Zoning Ordinance Section 4.2 ' })
    expect(await rowOf(id)).toMatchObject({ ...SETBACKS, active: true, createdBy: admin.userId })
    const audits = await handle.db.select().from(auditLog).where(eq(auditLog.entityId, id))
    expect(audits.map((a) => a.action)).toEqual(['town_section.add'])
  })

  it('refuses a second active entry with the same reference in any case', async () => {
    await add()
    const again = await addTownSection(
      handle.db,
      admin,
      { ...SETBACKS, reference: 'zoning ordinance section 4.2' },
      signal,
    )
    expect(again).toEqual({ ok: false, error: 'reference_taken' })
  })

  it('allows the same reference under another kind', async () => {
    await add()
    const other = await addTownSection(
      handle.db,
      admin,
      { ...SETBACKS, provisionKind: 'other_local_ordinance' },
      signal,
    )
    expect(other.ok).toBe(true)
  })

  it('edits a section and records before and after', async () => {
    const id = await add()
    const saved = await editTownSection(
      handle.db,
      admin,
      { sectionId: id, ...SETBACKS, title: 'setbacks for sheds and garages' },
      signal,
    )
    expect(saved.ok).toBe(true)
    expect((await rowOf(id))?.title).toBe('setbacks for sheds and garages')
    const [audit] = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'town_section.edit'))
    expect(audit?.before).toMatchObject({ title: 'accessory structure setbacks' })
  })

  it('retires a section, frees its reference, and refuses editing it after', async () => {
    const id = await add()
    expect((await retireTownSection(handle.db, admin, { sectionId: id }, signal)).ok).toBe(true)
    expect((await rowOf(id))?.active).toBe(false)
    expect(await editTownSection(handle.db, admin, { sectionId: id, ...SETBACKS }, signal)).toEqual(
      { ok: false, error: 'retired' },
    )
    expect((await addTownSection(handle.db, admin, SETBACKS, signal)).ok).toBe(true)
  })

  it('refuses add, edit and retire to staff without config.edit', async () => {
    const id = await add()
    expect(await addTownSection(handle.db, staff, SETBACKS, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await editTownSection(handle.db, staff, { sectionId: id, ...SETBACKS }, signal)).toEqual(
      { ok: false, error: 'forbidden' },
    )
    expect(await retireTownSection(handle.db, staff, { sectionId: id }, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})
