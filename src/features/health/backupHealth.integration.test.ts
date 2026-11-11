import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { backupSchedule, exportTargets, healthAlerts } from '@/db/schema'
import { createEmailChannel } from '@/features/health/channels/emailChannel'
import { runHealthCheck } from '@/features/health/runHealthCheck'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedTown } from '@/test/parcels'

const signal = new AbortController().signal
const SINCE = new Date('2027-03-01T12:00:00Z')
const HOUR_MS = 60 * 60 * 1000
let handle: TestDb
let targetId: string

beforeAll(async () => {
  handle = await makeTestDb()
  await seedTown(handle.db)
  const [target] = await handle.db
    .insert(exportTargets)
    .values({ kind: 'local_fs', name: 'Town server', settings: { root: '/srv/backups' } })
    .returning({ id: exportTargets.id })
  targetId = target?.id ?? ''
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(async () => {
  await handle.db.delete(healthAlerts)
  await handle.db.delete(backupSchedule)
})

async function check(at: Date) {
  const mail = createMemoryTransport()
  await runHealthCheck(
    handle.db,
    {
      channels: [createEmailChannel(mail, ['ops@alderpond.example'])],
      jobs: [],
      schedules: [],
      disks: [],
      heartbeatUrl: undefined,
      fetch,
      now: at,
    },
    signal,
  )
  return mail.sent.map((m) => m.subject)
}

describe('backup alerts in the health check', () => {
  it('stays quiet while no backup schedule is set up', async () => {
    expect(await check(new Date(SINCE.getTime() + 100 * HOUR_MS))).toEqual([])
  })

  it('emails when backups are overdue and when the last one failed, then resolves', async () => {
    await handle.db.insert(backupSchedule).values({
      id: 1,
      targetId,
      scheduledSince: SINCE,
      nextDueAt: new Date(SINCE.getTime() + 18 * HOUR_MS),
      lastFailureAt: new Date(SINCE.getTime() + 18 * HOUR_MS),
      lastFailureKind: 'failed',
      lastError: 'The database could not be copied (pg_dump failed).',
    })
    expect((await check(new Date(SINCE.getTime() + 37 * HOUR_MS))).sort()).toEqual([
      '[critical] Town of Alder Pond: No backup has succeeded for more than a day. Backups are set to run every day.',
      '[critical] Town of Alder Pond: The last backup failed: The database could not be copied (pg_dump failed).',
    ])
    await handle.db
      .update(backupSchedule)
      .set({ lastSuccessAt: new Date(SINCE.getTime() + 38 * HOUR_MS) })
      .where(eq(backupSchedule.id, 1))
    const resolved = await check(new Date(SINCE.getTime() + 39 * HOUR_MS))
    expect(resolved).toHaveLength(2)
    expect(resolved.every((s) => s.includes('Resolved'))).toBe(true)
    const rows = await handle.db.select().from(healthAlerts)
    expect(rows.map((r) => [r.kind, r.state]).sort()).toEqual([
      ['backup_failed', 'resolved'],
      ['backup_overdue', 'resolved'],
    ])
  })
})
