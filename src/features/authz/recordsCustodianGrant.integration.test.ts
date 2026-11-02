import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_GRANTS } from '@/features/authz/defaultGrants'
import { makeTestDb, type TestDb } from '@/test/db'

const MIGRATION = new URL(
  '../../../drizzle/0055_records_custodian_document_manage.sql',
  import.meta.url,
)

let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(async () => {
  await handle.db.execute(sql`delete from role_capabilities`)
})

async function applyMigration(): Promise<void> {
  const statements = readFileSync(MIGRATION, 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  for (const statement of statements) await handle.db.execute(sql.raw(statement))
}

async function grantsOf(): Promise<string[]> {
  const r = await handle.db.execute<{ role: string; capability: string }>(
    sql`select role, capability from role_capabilities order by role, capability`,
  )
  return r.rows.map((row) => `${row.role}:${row.capability}`)
}

describe('records custodian document management grant', () => {
  it('is part of the default grants', () => {
    expect(DEFAULT_GRANTS.records_custodian).toContain('document.manage')
  })

  it('upgrades an install whose custodian already has grants and leaves other roles alone', async () => {
    await handle.db.execute(sql`
      insert into role_capabilities (role, capability) values
        ('records_custodian', 'hold.place_release'), ('finance', 'payment.collect')`)
    await applyMigration()
    expect(await grantsOf()).toEqual([
      'finance:payment.collect',
      'records_custodian:document.manage',
      'records_custodian:hold.place_release',
    ])
  })

  it('is idempotent and inserts nothing into an empty table', async () => {
    await applyMigration()
    expect(await grantsOf()).toEqual([])
    await handle.db.execute(
      sql`insert into role_capabilities (role, capability) values ('records_custodian', 'hold.place_release')`,
    )
    await applyMigration()
    const once = await grantsOf()
    await applyMigration()
    expect(await grantsOf()).toEqual(once)
  })
})
