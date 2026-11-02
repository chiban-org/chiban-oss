import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { exportsTable, exportTargets } from '@/db/schema'
import { runJob } from '@/jobs/defineJob'
import { exportsIncrementalJob } from '@/jobs/exportsIncremental'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel, seedFormats, seedTown } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

async function newTarget(dayOfMonth: number, name: string, root?: string) {
  const dir = root ?? (await mkdtemp(join(tmpdir(), 'chiban-job-')))
  const [row] = await handle.db
    .insert(exportTargets)
    .values({ kind: 'local_fs', name, settings: { root: dir }, dayOfMonth })
    .returning({ id: exportTargets.id })
  return { id: row?.id ?? '', root: dir }
}

async function tick(at: string, manual = false) {
  return await runJob(handle.db, exportsIncrementalJob, { at, manual }, signal)
}

async function readyCount(targetId: string): Promise<number> {
  const rows = await handle.db
    .select({ id: exportsTable.id })
    .from(exportsTable)
    .where(and(eq(exportsTable.targetId, targetId), eq(exportsTable.status, 'ready')))
  return rows.length
}

beforeAll(async () => {
  handle = await makeTestDb()
  await seedFormats(handle.db)
  await seedTown(handle.db)
  await makeParcel(handle.db, [])
})
afterAll(async () => {
  await handle.drop()
})

describe('exports.incremental', () => {
  it('job runs on day_of_month and not again that month', async () => {
    const target = await newTarget(5, 'Fifth')
    expect((await tick('2026-11-02T15:00:00Z')).ok).toBe(true)
    expect(await readyCount(target.id)).toBe(0)
    expect((await tick('2026-11-05T15:00:00Z')).ok).toBe(true)
    expect(await readyCount(target.id)).toBe(1)
    expect((await tick('2026-11-06T15:00:00Z')).ok).toBe(true)
    expect((await tick('2026-11-30T15:00:00Z')).ok).toBe(true)
    expect(await readyCount(target.id)).toBe(1)
    expect((await tick('2026-12-05T15:00:00Z')).ok).toBe(true)
    expect(await readyCount(target.id)).toBe(2)
    const [row] = await handle.db
      .select()
      .from(exportTargets)
      .where(eq(exportTargets.id, target.id))
    expect(row?.lastSuccessAt).not.toBeNull()
  })

  it('a target whose day has already passed this month runs on the next daily check', async () => {
    const target = await newTarget(1, 'First of the month')
    expect((await tick('2027-03-09T15:00:00Z')).ok).toBe(true)
    expect(await readyCount(target.id)).toBe(1)
  })

  it('uses the town time zone to decide which month it is', async () => {
    const target = await newTarget(1, 'Zone edge')
    expect((await tick('2027-05-01T02:00:00Z')).ok).toBe(true)
    expect((await tick('2027-05-02T02:00:00Z')).ok).toBe(true)
    const rows = await handle.db
      .select({ key: exportsTable.storageKey })
      .from(exportsTable)
      .where(and(eq(exportsTable.targetId, target.id), eq(exportsTable.status, 'ready')))
    expect(rows.map((r) => r.key).sort()).toEqual([
      'chiban-export/2027-04',
      'chiban-export/2027-05',
    ])
  })

  it('skips a deactivated target', async () => {
    const target = await newTarget(1, 'Off')
    await handle.db
      .update(exportTargets)
      .set({ isActive: false })
      .where(eq(exportTargets.id, target.id))
    expect((await tick('2027-06-10T15:00:00Z')).ok).toBe(true)
    expect(await readyCount(target.id)).toBe(0)
  })

  it('a run now request runs once even before the target is due and clears the flag', async () => {
    const target = await newTarget(28, 'Run now')
    await handle.db
      .update(exportTargets)
      .set({ runRequestedAt: new Date() })
      .where(eq(exportTargets.id, target.id))
    expect((await tick('2027-07-03T15:00:00Z', true)).ok).toBe(true)
    expect(await readyCount(target.id)).toBe(1)
    const [row] = await handle.db
      .select()
      .from(exportTargets)
      .where(eq(exportTargets.id, target.id))
    expect(row?.runRequestedAt).toBeNull()
    expect((await tick('2027-07-04T15:00:00Z')).ok).toBe(true)
    expect(await readyCount(target.id)).toBe(1)
  })

  it('one failing target is recorded and does not stop the others', async () => {
    const blocker = join(await mkdtemp(join(tmpdir(), 'chiban-job-')), 'a-file')
    await writeFile(blocker, 'x')
    const broken = await newTarget(1, 'Broken', join(blocker, 'inside'))
    const fine = await newTarget(1, 'Fine')
    const result = await tick('2027-08-10T15:00:00Z')
    expect(result.ok).toBe(false)
    expect(await readyCount(fine.id)).toBe(1)
    expect(await readyCount(broken.id)).toBe(0)
    const [row] = await handle.db
      .select()
      .from(exportTargets)
      .where(eq(exportTargets.id, broken.id))
    expect(row?.lastFailureAt).not.toBeNull()
    expect(row?.lastError).not.toBeNull()
  })

  it('a target with settings that no longer validate is recorded as failed', async () => {
    const target = await newTarget(1, 'Bad settings')
    await handle.db
      .update(exportTargets)
      .set({ settings: { root: 'relative' } })
      .where(eq(exportTargets.id, target.id))
    const result = await tick('2027-09-10T15:00:00Z')
    expect(result.ok).toBe(false)
    const [row] = await handle.db
      .select()
      .from(exportTargets)
      .where(eq(exportTargets.id, target.id))
    expect(row?.lastError).toContain('settings')
  })
})
