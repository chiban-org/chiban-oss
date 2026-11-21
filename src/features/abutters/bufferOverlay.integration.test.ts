import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { issueList } from '@/features/abutters/issue'
import { attestCrossings, generateList } from '@/features/abutters/lists'
import { loadListView } from '@/features/abutters/listView'
import { currentIssuedList, snapshotHash } from '@/features/abutters/queries'
import { activeBoards } from '@/features/boards/townBoards'
import { demoBoardSettings } from '@/features/demo/demoBoardNotices'
import { setActivePackForTest } from '@/features/packs/registry'
import { type BoardWorld, publishRegionalContacts, setupBoardWorld } from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'
import { packWithTownBuffer } from '@/test/packs/townBufferPack'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let lw: ListWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  await publishRegionalContacts(handle.db, world)
  lw = await prepareListWorld(handle.db, world)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function publishAbutters(projectionEnabled: boolean, bufferFt: number | null) {
  const defaults = demoBoardSettings(await activeBoards(handle.db))
  await saveAndPublish(handle.db, world.admin, 'board_settings', 'default', {
    ...defaults,
    abutters: {
      ...defaults.abutters,
      projectionEnabled,
      layersConfirmedBy: 'Land Use Technician',
      layersConfirmedOn: '2027-02-01',
      bufferFt,
    },
  })
}

async function drawList() {
  const made = await generateList(
    handle.db,
    world.staff,
    { applicationId: lw.applicationId },
    signal,
    LIST_NOW,
  )
  if (!made.ok) throw new Error(`generate failed: ${JSON.stringify(made.error)}`)
  return made.value.listId
}

const kindsOf = (view: Awaited<ReturnType<typeof loadListView>>) =>
  (view?.overlay?.features ?? []).map((f) => f.properties.kind).filter((k) => k !== 'label')

describe('buffer overlay without projection', () => {
  it('draws only the buffer outline for an issued list when projection is off', async () => {
    setActivePackForTest(packWithTownBuffer({ defaultFt: null, maxFt: 500 }))
    await publishAbutters(false, 100)
    const listId = await drawList()
    await attestCrossings(handle.db, world.staff, { listId }, signal, LIST_NOW)
    const issued = await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)
    expect(issued.ok).toBe(true)
    const view = await loadListView(handle.db, world.staff, listId, signal)
    expect(view?.status).toBe('issued')
    expect(kindsOf(view)).toEqual(['buffer'])
    expect(view?.bbox).not.toBeNull()
    const stored = await currentIssuedList(handle.db, lw.applicationId, signal)
    expect(stored === null ? null : snapshotHash(stored.snapshot)).toBe(stored?.snapshotSha256)
  })

  it('has no overlay when the list has no buffer', async () => {
    setActivePackForTest(packWithTownBuffer({ defaultFt: null, maxFt: 500 }))
    await publishAbutters(false, null)
    const view = await loadListView(handle.db, world.staff, await drawList(), signal)
    expect(view?.overlay).toBeNull()
  })

  it('draws the outline once when projection is on', async () => {
    setActivePackForTest(packWithTownBuffer({ defaultFt: null, maxFt: 500 }))
    await publishAbutters(true, 100)
    const view = await loadListView(handle.db, world.staff, await drawList(), signal)
    const kinds = kindsOf(view)
    expect(kinds.filter((k) => k === 'buffer')).toHaveLength(1)
    expect(kinds).toContain('corner')
  })
})
