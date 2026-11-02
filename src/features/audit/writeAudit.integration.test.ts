import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLog } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import { makeTestDb, type TestDb } from '@/test/db'

let handle: TestDb
const signal = new AbortController().signal

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})

describe('writeAudit', () => {
  it('stores no user, IP, or user agent for anonymous public intake', async () => {
    await writeAudit(
      handle.db,
      {
        actor: { kind: 'anonymous_public_intake' },
        action: 'intake.submitted',
        entityType: 'application',
        entityId: 'a1',
      },
      signal,
    )
    const rows = await handle.db.select().from(auditLog)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.actorKind).toBe('anonymous_public_intake')
    expect(rows[0]?.actorUserId).toBeNull()
    expect(rows[0]?.actorJob).toBeNull()
  })

  it('has no IP or user agent columns', async () => {
    const result = await handle.db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_name = 'audit_log'`,
    )
    const names = result.rows.map((r) => r.column_name)
    expect(names.some((n) => /ip|agent/i.test(n))).toBe(false)
  })

  it('records user and system actors with before and after', async () => {
    const userId = '00000000-0000-4000-8000-000000000001'
    await writeAudit(
      handle.db,
      {
        actor: { kind: 'user', userId },
        action: 'x.updated',
        entityType: 'x',
        entityId: '1',
        before: { a: 1 },
        after: { a: 2 },
      },
      signal,
    )
    await writeAudit(
      handle.db,
      {
        actor: { kind: 'system', job: 'nightly' },
        action: 'y',
        entityType: 'y',
        entityId: '2',
      },
      signal,
    )
    const rows = await handle.db.select().from(auditLog)
    const user = rows.find((r) => r.actorKind === 'user')
    const system = rows.find((r) => r.actorKind === 'system')
    expect(user?.actorUserId).toBe(userId)
    expect(user?.before).toEqual({ a: 1 })
    expect(user?.after).toEqual({ a: 2 })
    expect(system?.actorJob).toBe('nightly')
  })
})
