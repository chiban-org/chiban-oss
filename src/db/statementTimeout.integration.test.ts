import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withStatementTimeout } from '@/db/statementTimeout'
import { makeTestDb, type TestDb } from '@/test/db'

let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})

async function settingNow(): Promise<string> {
  const res = await handle.db.execute<{ t: string }>(
    sql`SELECT current_setting('statement_timeout') AS t`,
  )
  return res.rows[0]?.t ?? ''
}

describe('running queries under a statement timeout', () => {
  it('cancels a query that runs longer than the timeout', async () => {
    await expect(
      withStatementTimeout(handle.db, 50, (tx) => tx.execute(sql`SELECT pg_sleep(1)`)),
    ).rejects.toMatchObject({ cause: { code: '57014' } })
  })

  it('returns the result of a quick query and leaves other queries unlimited', async () => {
    const before = await settingNow()
    const res = await withStatementTimeout(handle.db, 5000, (tx) =>
      tx.execute<{ one: number }>(sql`SELECT 1 AS one`),
    )
    expect(res.rows[0]?.one).toBe(1)
    expect(await settingNow()).toBe(before)
  })
})
