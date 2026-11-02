import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { makeTestDb, type TestDb } from '@/test/db'

const opened: TestDb[] = []

async function open(): Promise<TestDb> {
  const handle = await makeTestDb()
  opened.push(handle)
  return handle
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((h) => h.drop()))
})

describe('template database harness', () => {
  it('has PostGIS installed on a cloned database', async () => {
    const { db } = await open()
    const result = await db.execute<{ v: string }>(sql`select postgis_version() as v`)
    expect(typeof result.rows[0]?.v).toBe('string')
  })

  it('isolates inserts between two cloned databases', async () => {
    const a = await open()
    const b = await open()
    for (const h of [a, b]) {
      await h.db.execute(sql`create table scratch (id int primary key)`)
    }
    await a.db.execute(sql`insert into scratch values (1)`)
    const countA = await a.db.execute<{ n: number }>(sql`select count(*)::int as n from scratch`)
    const countB = await b.db.execute<{ n: number }>(sql`select count(*)::int as n from scratch`)
    expect(countA.rows[0]?.n).toBe(1)
    expect(countB.rows[0]?.n).toBe(0)
  })
})
