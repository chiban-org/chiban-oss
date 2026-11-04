import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_GRANTS } from '@/features/authz/defaultGrants'
import { makeTestDb, type TestDb } from '@/test/db'

const MIGRATION = new URL('../../../drizzle/0084_application_manage_grant.sql', import.meta.url)

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

describe('application.manage grant', () => {
  it('is a default grant of staff and admin only', () => {
    const holders = Object.entries(DEFAULT_GRANTS)
      .filter(([, caps]) => caps.includes('application.manage'))
      .map(([role]) => role)
    expect(holders.sort()).toEqual(['admin', 'staff'])
  })

  it('reaches staff and admin on an upgraded install and leaves other roles alone', async () => {
    await handle.db.execute(sql`
      insert into role_capabilities (role, capability) values
        ('admin', 'config.edit'), ('staff', 'permit.issue'),
        ('finance', 'payment.collect'), ('inspector', 'inspection.record')`)
    await applyMigration()
    await applyMigration()
    expect(await grantsOf()).toEqual(
      [
        'admin:application.manage',
        'admin:config.edit',
        'finance:payment.collect',
        'inspector:inspection.record',
        'staff:application.manage',
        'staff:permit.issue',
      ].sort(),
    )
  })

  it('inserts nothing when role_capabilities is empty', async () => {
    await applyMigration()
    expect(await grantsOf()).toEqual([])
  })
})
