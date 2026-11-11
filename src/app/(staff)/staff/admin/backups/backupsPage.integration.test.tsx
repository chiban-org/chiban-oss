import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { backupSchedule, exportTargets } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
vi.mock('@/app/(staff)/staff/admin/backups/actions', () => ({
  saveBackupScheduleAction: () => Promise.resolve({ ok: true, message: '' }),
  backUpNowAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { default: BackupsPage } = await import('./page')

let handle: TestDb
let admin: Actor
let reviewer: Actor

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function alerts(html: string): string[] {
  return [...html.matchAll(/<p[^>]*role="alert"[^>]*>([\s\S]*?)<\/p>/g)].map((m) =>
    text(m[1] ?? ''),
  )
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  reviewer = await staffActor(handle.db, 'reviewer')
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(async () => {
  state.actor = admin
  await handle.db.delete(backupSchedule)
})

describe('backups page', () => {
  it('says backups are off and points to adding storage when there is none', async () => {
    const html = renderToStaticMarkup(await BackupsPage())
    expect(text(html)).toContain('Scheduled backups are off.')
    expect(text(html)).toContain('No storage is set up yet.')
    expect(html).toContain('href="/staff/admin/export/targets"')
    expect(html).not.toContain('Back up now')
    expect(html).not.toContain(String.fromCodePoint(0x2014))
  })

  it('shows the target, last success, last failure with its error and the next run', async () => {
    const [target] = await handle.db
      .insert(exportTargets)
      .values({ kind: 'local_fs', name: 'Town server', settings: { root: '/srv/backups' } })
      .returning({ id: exportTargets.id })
    await handle.db.insert(backupSchedule).values({
      id: 1,
      targetId: target?.id ?? null,
      frequency: 'daily',
      startHour: 1,
      keepCount: 14,
      scheduledSince: new Date('2027-03-01T12:00:00Z'),
      nextDueAt: new Date('2099-03-04T06:00:00Z'),
      lastSuccessAt: new Date('2027-03-02T06:04:00Z'),
      lastSuccessPath: 'backups/chiban-backup-2027-03-02.bin',
      lastSuccessBytes: 2_500_000,
      lastFailureAt: new Date('2027-03-03T06:02:00Z'),
      lastFailureKind: 'failed',
      lastError: 'The database could not be copied (pg_dump failed).',
      lastPruneError: 'the folder is not writable',
    })
    const html = renderToStaticMarkup(await BackupsPage())
    const page = text(html)
    expect(page).toContain('Backups go to Town server, every day at 1:00 AM.')
    expect(page).toContain(
      'Last backup: March 2, 2027, 1:04 AM. File backups/chiban-backup-2027-03-02.bin, 2.5 MB.',
    )
    expect(page).toContain('Next backup: March 4, 2099, 1:00 AM.')
    expect(alerts(html)).toEqual([
      'Last backup failed March 3, 2027, 1:02 AM: The database could not be copied (pg_dump failed).',
      'Old backups could not be removed: the folder is not writable',
    ])
    expect(html).toContain('Back up now')
    expect(html).toMatch(/<option[^>]*selected[^>]*>Town server/)
  })

  it('says why a skipped backup did not run', async () => {
    const [target] = await handle.db.select({ id: exportTargets.id }).from(exportTargets)
    await handle.db.insert(backupSchedule).values({
      id: 1,
      targetId: target?.id ?? null,
      scheduledSince: new Date('2027-03-01T12:00:00Z'),
      nextDueAt: new Date('2027-03-02T06:00:00Z'),
      lastFailureAt: new Date('2027-03-02T06:00:00Z'),
      lastFailureKind: 'skipped',
      lastError: 'BACKUP_PASSPHRASE is not set on the server, so no backup was made.',
    })
    const html = renderToStaticMarkup(await BackupsPage())
    expect(text(html)).toContain('No backup has been made yet.')
    expect(alerts(html)).toEqual([
      'Last backup did not run March 2, 2027, 1:00 AM: BACKUP_PASSPHRASE is not set on the server, so no backup was made.',
    ])
  })

  it('refuses a reviewer', async () => {
    state.actor = reviewer
    const html = renderToStaticMarkup(await BackupsPage())
    expect(html).toContain('You do not have permission')
    expect(html).not.toContain('Back up now')
  })
})
