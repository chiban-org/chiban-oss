import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cutoverReconciliations } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import {
  listRecentReconciliations,
  reconcileCutover,
  signOffReconciliation,
} from '@/features/cutover/reconcile'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const encoder = new TextEncoder()
let handle: TestDb
let admin: Actor
let staff: Actor

async function reconcile(csv: string): Promise<string> {
  const result = await reconcileCutover(
    handle.db,
    staff,
    { listBytes: encoder.encode(csv) },
    signal,
  )
  if (!result.ok) throw new Error(result.error)
  return result.value.id
}

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  staff = await staffActor(handle.db, 'staff')
})
afterAll(async () => {
  await handle.drop()
})

describe('recent reconciliations', () => {
  it('lists each comparison newest first with its counts and sign-off state', async () => {
    const first = await reconcile('legacy_number\nL-1\n')
    await handle.db
      .update(cutoverReconciliations)
      .set({ createdAt: new Date('2020-01-01T00:00:00Z') })
      .where(eq(cutoverReconciliations.id, first))
    const second = await reconcile('legacy_number\nL-1\nL-2\nL-3\n')
    expect((await signOffReconciliation(handle.db, admin, first, signal)).ok).toBe(true)
    const rows = await listRecentReconciliations(handle.db, signal)
    expect(rows.map((r) => r.id)).toEqual([second, first])
    expect(rows[0]).toMatchObject({ matched: 0, missing: 3, extra: 0, signedOffAt: null })
    expect(rows[1]?.signedOffAt).toBeInstanceOf(Date)
  })

  it('refuses to sign off a comparison twice and keeps the first sign-off', async () => {
    const id = await reconcile('legacy_number\nL-5\n')
    expect((await signOffReconciliation(handle.db, admin, id, signal)).ok).toBe(true)
    const [before] = await handle.db
      .select()
      .from(cutoverReconciliations)
      .where(eq(cutoverReconciliations.id, id))
    const other = await staffActor(handle.db, 'admin')
    expect(await signOffReconciliation(handle.db, other, id, signal)).toEqual({
      ok: false,
      error: 'already_signed_off',
    })
    const [after] = await handle.db
      .select()
      .from(cutoverReconciliations)
      .where(eq(cutoverReconciliations.id, id))
    expect(after?.signedOffBy).toBe(admin.userId)
    expect(after?.signedOffAt).toEqual(before?.signedOffAt)
  })
})
