import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { backupSchedule, exportTargets } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import type { BackupError } from '@/features/backup/createBackup'
import { buildTarget, saveTarget } from '@/features/export/targets/manageTargets'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { err, ok } from '@/types/result'
import { runScheduledBackup, type ScheduledBackupDeps } from './runScheduled'
import { readBackupSchedule, requestBackupNow, saveBackupSchedule } from './scheduleStore'

const signal = new AbortController().signal
const SAVED_AT = new Date('2027-03-01T17:00:00Z')
const FIRST_DUE = new Date('2027-03-02T06:00:00Z')
const PASSPHRASE = 'a long enough passphrase'
let handle: TestDb
let admin: Actor
let root: string
let targetId: string
let calls: number
let failWith: BackupError | null
let throwWith: Error | null

function deps(at: Date, passphrase: string | null = PASSPHRASE): ScheduledBackupDeps {
  return {
    passphrase: passphrase ?? undefined,
    now: () => at,
    build: (row) => buildTarget(row, { fetch, now: () => at }),
    backup: async (target, _passphrase, s) => {
      calls += 1
      if (throwWith !== null) throw throwWith
      if (failWith !== null) return err(failWith)
      const path = `backups/chiban-backup-${at.toISOString().slice(0, 10)}.bin`
      const put = await target.put(path, Readable.from([Buffer.from('backup')]), 6, s)
      if (!put.ok) return put
      return ok({ path, sizeBytes: 6, objects: 0 })
    },
  }
}

const later = (ms: number) => new Date(FIRST_DUE.getTime() + ms)

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  root = await mkdtemp(join(tmpdir(), 'chiban-scheduled-'))
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
beforeEach(async () => {
  calls = 0
  failWith = null
  throwWith = null
  await handle.db.delete(backupSchedule)
  const input = { at: SAVED_AT, targetId, frequency: 'daily' as const, startHour: 1, keepCount: 2 }
  await saveBackupSchedule(handle.db, admin, input, signal)
})

describe('runScheduledBackup', () => {
  it('does nothing while backups are off', async () => {
    const off = { at: SAVED_AT, targetId: null, frequency: 'daily' as const, startHour: 1 }
    await saveBackupSchedule(handle.db, admin, { ...off, keepCount: 2 }, signal)
    expect(await runScheduledBackup(handle.db, deps(later(0)), signal)).toBe('off')
    expect(calls).toBe(0)
  })

  it('does nothing before the due time', async () => {
    expect(await runScheduledBackup(handle.db, deps(later(-1)), signal)).toBe('not_due')
    expect(calls).toBe(0)
  })

  it('skips with a clear reason when the passphrase is not set, and keeps the due time', async () => {
    expect(await runScheduledBackup(handle.db, deps(later(0), null), signal)).toBe('skipped')
    expect(calls).toBe(0)
    expect(await readBackupSchedule(handle.db, signal)).toMatchObject({
      lastFailureAt: later(0),
      lastFailureKind: 'skipped',
      lastError:
        'BACKUP_PASSPHRASE is not set on the server, so no backup was made. Whoever runs the server needs to set it and restart the worker.',
      lastSuccessAt: null,
      nextDueAt: FIRST_DUE,
    })
  })

  it('backs up when due, records the file and moves the due time to the next day', async () => {
    expect(await runScheduledBackup(handle.db, deps(later(60_000)), signal)).toBe('succeeded')
    expect(await readBackupSchedule(handle.db, signal)).toMatchObject({
      lastStartedAt: later(60_000),
      lastSuccessAt: later(60_000),
      lastSuccessPath: 'backups/chiban-backup-2027-03-02.bin',
      lastSuccessBytes: 6,
      nextDueAt: new Date('2027-03-03T06:00:00Z'),
      lastPruneError: null,
    })
  })

  it('records a failure in plain words, keeps the due time and waits before retrying', async () => {
    failWith = 'dump_failed'
    expect(await runScheduledBackup(handle.db, deps(later(0)), signal)).toBe('failed')
    expect(await readBackupSchedule(handle.db, signal)).toMatchObject({
      lastFailureAt: later(0),
      lastFailureKind: 'failed',
      lastError: 'The database could not be copied (pg_dump failed).',
      nextDueAt: FIRST_DUE,
    })
    expect(await runScheduledBackup(handle.db, deps(later(60 * 60 * 1000)), signal)).toBe('not_due')
    expect(calls).toBe(1)
  })

  it('records a backup that stops with an unexpected error', async () => {
    throwWith = new Error('file storage did not answer')
    expect(await runScheduledBackup(handle.db, deps(later(0)), signal)).toBe('failed')
    expect(await readBackupSchedule(handle.db, signal)).toMatchObject({
      lastFailureAt: later(0),
      lastFailureKind: 'failed',
      lastError: 'The backup stopped with an unexpected error: file storage did not answer',
      nextDueAt: FIRST_DUE,
    })
  })

  it('records a backup cut off at its time limit and still stops the job', async () => {
    throwWith = new DOMException('The operation was aborted.', 'AbortError')
    await expect(runScheduledBackup(handle.db, deps(later(0)), signal)).rejects.toThrow('aborted')
    expect(await readBackupSchedule(handle.db, signal)).toMatchObject({
      lastFailureKind: 'failed',
      lastError: 'The backup was stopped because it ran longer than the time allowed.',
    })
  })

  it('names the missing files when stored files cannot be found', async () => {
    failWith = { missingObjects: ['blobs/a', 'blobs/b'] }
    await runScheduledBackup(handle.db, deps(later(0)), signal)
    expect((await readBackupSchedule(handle.db, signal))?.lastError).toBe(
      '2 stored files that records point to are missing from file storage, so no backup was made.',
    )
  })

  it('keeps only the newest backups on the target and leaves other files', async () => {
    await mkdir(join(root, 'backups'), { recursive: true })
    const old = ['chiban-backup-2027-02-01.bin', 'chiban-backup-2027-02-02.bin']
    for (const name of old) await writeFile(join(root, 'backups', name), 'old')
    await writeFile(join(root, 'backups', 'readme.txt'), 'keep')
    await runScheduledBackup(handle.db, deps(later(0)), signal)
    expect((await readdir(join(root, 'backups'))).sort()).toEqual([
      'chiban-backup-2027-02-02.bin',
      'chiban-backup-2027-03-02.bin',
      'readme.txt',
    ])
  })

  it('a request to back up now runs at once and leaves a future due time alone', async () => {
    const asked = new Date('2027-03-01T18:00:00Z')
    await requestBackupNow(handle.db, admin, asked, signal)
    expect(await runScheduledBackup(handle.db, deps(asked), signal)).toBe('succeeded')
    expect(await readBackupSchedule(handle.db, signal)).toMatchObject({
      runRequestedAt: null,
      nextDueAt: FIRST_DUE,
      lastSuccessAt: asked,
    })
  })

  it('reports storage settings that cannot be used', async () => {
    await handle.db
      .update(exportTargets)
      .set({ settings: { root: 42 } })
      .where(eq(exportTargets.id, targetId))
    expect(await runScheduledBackup(handle.db, deps(later(0)), signal)).toBe('failed')
    expect((await readBackupSchedule(handle.db, signal))?.lastError).toBe(
      'The storage settings for Town server cannot be used. Check them under Copy exports to your own storage.',
    )
    await handle.db
      .update(exportTargets)
      .set({ settings: { root } })
      .where(eq(exportTargets.id, targetId))
  })
})
