import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { exportTargets } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { compareTowns } from '@/features/export/compareTowns'
import { importFromTarget } from '@/features/export/importFromTarget'
import { runIncremental } from '@/features/export/incremental'
import { createLocalFsTarget } from '@/features/export/targets/localFs'
import { saveTarget } from '@/features/export/targets/manageTargets'
import { getObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const store = getObjectStore()
const NOV = new Date('2026-11-02T15:00:00Z')
const DEC = new Date('2026-12-02T15:00:00Z')

let handle: TestDb
let admin: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  await makeParcel(handle.db, [])
  admin = await staffActor(handle.db, 'admin')
}, 120_000)
afterAll(async () => {
  await handle.drop()
})

async function tempRoot(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'chiban-destination-'))
}

async function addTarget(root: string): Promise<string> {
  const saved = await saveTarget(
    handle.db,
    admin,
    { kind: 'local_fs', name: 'Town server', dayOfMonth: 2, settings: { root }, credentials: null },
    signal,
  )
  if (!saved.ok) throw new Error(saved.error)
  return saved.value.id
}

describe('incremental export destination', () => {
  it('a month folder already present at the target is skipped even when the exports table is empty', async () => {
    const root = await tempRoot()
    const targetId = await addTarget(root)
    await mkdir(join(root, 'chiban-export/2026-11'), { recursive: true })
    await writeFile(join(root, 'chiban-export/2026-11/manifest.json'), 'precious')
    const result = await runIncremental(
      handle.db,
      store,
      createLocalFsTarget({ root }),
      targetId,
      NOV,
      signal,
    )
    expect(result.ok, JSON.stringify(result)).toBe(true)
    expect(await readFile(join(root, 'chiban-export/2026-11/manifest.json'), 'utf8')).toBe(
      'precious',
    )
    const manifest = JSON.parse(
      await readFile(join(root, 'chiban-export/2026-11-2/manifest.json'), 'utf8'),
    ) as { kind: string }
    expect(manifest.kind).toBe('incremental')
  })

  it('changing the destination makes the next run a full export that restores on its own', async () => {
    const first = await tempRoot()
    const second = await tempRoot()
    const targetId = await addTarget(first)
    const run = async (root: string, now: Date) =>
      await runIncremental(handle.db, store, createLocalFsTarget({ root }), targetId, now, signal)
    expect((await run(first, NOV)).ok).toBe(true)

    const edited = await saveTarget(
      handle.db,
      admin,
      {
        id: targetId,
        kind: 'local_fs',
        name: 'Town server',
        dayOfMonth: 2,
        settings: { root: second },
        credentials: null,
      },
      signal,
    )
    expect(edited.ok).toBe(true)
    const result = await run(second, DEC)
    expect(result.ok, JSON.stringify(result)).toBe(true)

    const restored = await makeTestDb()
    const { store: freshStore } = await makeTestStore()
    try {
      const imported = await importFromTarget(
        restored.db,
        freshStore,
        createLocalFsTarget({ root: second }),
        '2026-12',
        signal,
      )
      expect(imported.ok, JSON.stringify(imported)).toBe(true)
      const diffs = await compareTowns(handle.db, restored.db, signal)
      expect(diffs.filter((d) => d.onlyInA + d.onlyInB + d.differing > 0)).toEqual([])
    } finally {
      await restored.drop()
    }
    expect((await handle.db.select().from(exportTargets)).length).toBeGreaterThan(0)
  }, 120_000)
})
