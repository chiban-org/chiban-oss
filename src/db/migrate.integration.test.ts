import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { applyMigrations } from '@/db/migrate'
import { makeEmptyDb, type TestDb } from '@/test/db'

const opened: TestDb[] = []
const signal = new AbortController().signal

afterAll(async () => {
  await Promise.all(opened.map((h) => h.drop()))
})

describe('applyMigrations', () => {
  it('bootstraps extensions and schema on a database that has neither', async () => {
    const handle = await makeEmptyDb()
    opened.push(handle)
    const result = await applyMigrations(handle.db, signal)
    expect(result).toEqual({ ok: true, value: { applied: true } })
    const rows = await handle.db.execute<{ v: string }>(sql`select postgis_version() as v`)
    expect(typeof rows.rows[0]?.v).toBe('string')
    const users = await handle.db.execute<{ n: number }>(sql`select count(*)::int as n from users`)
    expect(users.rows[0]?.n).toBe(0)
  })

  it('is a no-op the second time', async () => {
    const handle = await makeEmptyDb()
    opened.push(handle)
    expect((await applyMigrations(handle.db, signal)).ok).toBe(true)
    expect((await applyMigrations(handle.db, signal)).ok).toBe(true)
  })
})
