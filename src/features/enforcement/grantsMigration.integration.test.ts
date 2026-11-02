import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Capability } from '@/constants/capabilities'
import { DEFAULT_GRANTS } from '@/features/authz/defaultGrants'
import { makeTestDb, type TestDb } from '@/test/db'

const ENFORCEMENT_CAPABILITIES: Capability[] = [
  'enforcement.manage',
  'enforcement.issue_order',
  'enforcement.record_service',
  'enforcement.refer_counsel',
  'fine.record',
  'anonymous_intake.enable',
]
const MIGRATION = new URL('../../../drizzle/0075_m9_enforcement_grants.sql', import.meta.url)

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

const expectedFor = (role: keyof typeof DEFAULT_GRANTS) =>
  (DEFAULT_GRANTS[role] ?? [])
    .filter((c) => ENFORCEMENT_CAPABILITIES.includes(c))
    .map((c) => `${role}:${c}`)

describe('enforcement grants migration for upgraded installs', () => {
  it('adds enforcement capabilities to roles that already have grants and leaves other roles alone', async () => {
    await handle.db.execute(sql`
      insert into role_capabilities (role, capability) values
        ('admin', 'config.edit'), ('staff', 'permit.issue'), ('finance', 'payment.collect'),
        ('inspector', 'inspection.record')`)
    await applyMigration()
    const expected = [
      ...(['admin', 'staff', 'finance', 'inspector'] as const).flatMap(expectedFor),
      'admin:config.edit',
      'staff:permit.issue',
      'finance:payment.collect',
      'inspector:inspection.record',
    ].sort()
    expect(await grantsOf()).toEqual(expected)
  })

  it('is idempotent', async () => {
    await handle.db.execute(
      sql`insert into role_capabilities (role, capability) values ('admin', 'config.edit')`,
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
