import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_GRANTS } from '@/features/authz/defaultGrants'
import { makeTestDb, type TestDb } from '@/test/db'

const MIGRATION = new URL('../../../drizzle/0086_staff_account_links.sql', import.meta.url)

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

async function applyGrant(): Promise<void> {
  const statements = readFileSync(MIGRATION, 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('insert into role_capabilities'))
  expect(statements).toHaveLength(1)
  for (const statement of statements) await handle.db.execute(sql.raw(statement))
}

async function grantsOf(): Promise<string[]> {
  const r = await handle.db.execute<{ role: string; capability: string }>(
    sql`select role, capability from role_capabilities order by role, capability`,
  )
  return r.rows.map((row) => `${row.role}:${row.capability}`)
}

describe('user.manage grant', () => {
  it('is a default grant of admin only', () => {
    const holders = Object.entries(DEFAULT_GRANTS)
      .filter(([, caps]) => caps.includes('user.manage'))
      .map(([role]) => role)
    expect(holders).toEqual(['admin'])
  })

  it('reaches admin on an upgraded install and leaves other roles alone', async () => {
    await handle.db.execute(sql`
      insert into role_capabilities (role, capability) values
        ('admin', 'config.edit'), ('staff', 'permit.issue')`)
    await applyGrant()
    await applyGrant()
    expect(await grantsOf()).toEqual([
      'admin:config.edit',
      'admin:user.manage',
      'staff:permit.issue',
    ])
  })

  it('inserts nothing when role_capabilities is empty', async () => {
    await applyGrant()
    expect(await grantsOf()).toEqual([])
  })
})
