import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLog, backupSchedule } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { saveTarget } from '@/features/export/targets/manageTargets'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { readBackupSchedule, requestBackupNow, saveBackupSchedule } from './scheduleStore'

const signal = new AbortController().signal
const NOW = new Date('2027-03-01T17:00:00Z')
let handle: TestDb
let admin: Actor
let reviewer: Actor
let targetId: string

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  reviewer = await staffActor(handle.db, 'reviewer')
  const root = await mkdtemp(join(tmpdir(), 'chiban-backup-target-'))
  const saved = await saveTarget(
    handle.db,
    admin,
    { kind: 'local_fs', name: 'Town server', dayOfMonth: 1, settings: { root }, credentials: null },
    signal,
  )
  if (!saved.ok) throw new Error(saved.error)
  targetId = saved.value.id
})
afterAll(async () => {
  await handle.drop()
})

const daily = (over: Partial<Parameters<typeof saveBackupSchedule>[2]> = {}) => ({
  at: NOW,
  targetId,
  frequency: 'daily' as const,
  startHour: 1,
  keepCount: 14,
  ...over,
})

describe('backup schedule', () => {
  it('reads as not set up before anyone saves it', async () => {
    expect(await readBackupSchedule(handle.db, signal)).toBeNull()
  })

  it('refuses staff without config.edit', async () => {
    expect(await saveBackupSchedule(handle.db, reviewer, daily(), signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await requestBackupNow(handle.db, reviewer, NOW, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('refuses a target that does not exist', async () => {
    const missing = daily({ targetId: '00000000-0000-4000-8000-00000000abcd' })
    expect(await saveBackupSchedule(handle.db, admin, missing, signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('turning backups on sets the first run at the start hour in the town time zone', async () => {
    expect((await saveBackupSchedule(handle.db, admin, daily(), signal)).ok).toBe(true)
    const row = await readBackupSchedule(handle.db, signal)
    expect(row).toMatchObject({
      targetId,
      frequency: 'daily',
      startHour: 1,
      keepCount: 14,
      scheduledSince: NOW,
      nextDueAt: new Date('2027-03-02T06:00:00Z'),
    })
    const audit = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'backup_schedule.edit'))
    expect(audit).toHaveLength(1)
  })

  it('changing only how many to keep leaves the due time and start alone', async () => {
    const later = new Date(NOW.getTime() + 60_000)
    await saveBackupSchedule(handle.db, admin, daily({ keepCount: 5, at: later }), signal)
    expect(await readBackupSchedule(handle.db, signal)).toMatchObject({
      keepCount: 5,
      scheduledSince: NOW,
      nextDueAt: new Date('2027-03-02T06:00:00Z'),
    })
  })

  it('changing the start hour moves the next run', async () => {
    await saveBackupSchedule(handle.db, admin, daily({ startHour: 3, keepCount: 5 }), signal)
    expect(await readBackupSchedule(handle.db, signal)).toMatchObject({
      nextDueAt: new Date('2027-03-02T08:00:00Z'),
      scheduledSince: NOW,
    })
  })

  it('a request to back up now is recorded for the worker', async () => {
    expect(await requestBackupNow(handle.db, admin, NOW, signal)).toEqual({
      ok: true,
      value: undefined,
    })
    expect((await readBackupSchedule(handle.db, signal))?.runRequestedAt).toEqual(NOW)
  })

  it('turning backups off clears the due time and any request', async () => {
    await saveBackupSchedule(handle.db, admin, daily({ targetId: null }), signal)
    const [row] = await handle.db.select().from(backupSchedule)
    expect(row).toMatchObject({
      targetId: null,
      nextDueAt: null,
      runRequestedAt: null,
      scheduledSince: null,
    })
    expect(await requestBackupNow(handle.db, admin, NOW, signal)).toEqual({
      ok: false,
      error: 'not_scheduled',
    })
  })
})
