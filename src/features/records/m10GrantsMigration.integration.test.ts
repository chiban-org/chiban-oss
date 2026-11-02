import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeTestDb, type TestDb } from '@/test/db'

const MIGRATION = new URL('../../../drizzle/0079_m10_records_grants.sql', import.meta.url)
const NEW_GRANTS = [
  'records_custodian:disposition.propose',
  'records_custodian:redaction.create',
  'records_custodian:rtk.manage',
  'staff:disposition.propose',
  'staff:redaction.create',
  'staff:rtk.manage',
]

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

describe('records grants migration for upgraded installs', () => {
  it('adds the records capabilities to staff and the records custodian and leaves other roles alone', async () => {
    await handle.db.execute(sql`
      insert into role_capabilities (role, capability) values
        ('admin', 'config.edit'), ('staff', 'permit.issue'), ('records_custodian', 'hold.place_release'),
        ('finance', 'payment.collect')`)
    await applyMigration()
    expect(await grantsOf()).toEqual(
      [
        'admin:config.edit',
        'staff:permit.issue',
        'records_custodian:hold.place_release',
        'finance:payment.collect',
        ...NEW_GRANTS,
      ].sort(),
    )
  })

  it('is idempotent', async () => {
    await handle.db.execute(
      sql`insert into role_capabilities (role, capability) values ('staff', 'permit.issue')`,
    )
    await applyMigration()
    const once = await grantsOf()
    await applyMigration()
    expect(await grantsOf()).toEqual(once)
  })

  it('inserts nothing when role_capabilities is empty', async () => {
    await applyMigration()
    expect(await grantsOf()).toEqual([])
  })
})
