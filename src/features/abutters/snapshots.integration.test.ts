import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { abutterLists, remediationTasks } from '@/db/schema'
import { bufferOverlay } from '@/features/abutters/bufferOverlay'
import { issueList } from '@/features/abutters/issue'
import {
  attestCrossings,
  correctRecipient,
  decideTenant,
  excludeCandidate,
  generateList,
  selectParcel,
} from '@/features/abutters/lists'
import { loadListView } from '@/features/abutters/listView'
import { currentIssuedList, type ListSnapshot, snapshotHash } from '@/features/abutters/queries'
import { recordBoardRegionalImpact } from '@/features/boards/regionalImpact'
import { activeBoards } from '@/features/boards/townBoards'
import { demoBoardSettings } from '@/features/demo/demoBoardNotices'
import { canonicalJson } from '@/features/export/canonical'
import { setActivePackForTest } from '@/features/packs/registry'
import { upsertPark } from '@/features/rosters/parks'
import { addProfessional } from '@/features/rosters/professionals'
import { type BoardWorld, publishRegionalContacts, setupBoardWorld } from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { expectDbError } from '@/test/dbErrors'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'
import { packWithTownBuffer } from '@/test/packs/townBufferPack'
import type { CivilDate } from '@/types/civilDate'

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

async function generate(now = LIST_NOW) {
  const made = await generateList(
    handle.db,
    world.staff,
    { applicationId: lw.applicationId },
    signal,
    now,
  )
  if (!made.ok) throw new Error(`generate failed: ${JSON.stringify(made.error)}`)
  return made.value
}

async function issue(listId: string) {
  return await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)
}

describe('frozen snapshots', () => {
  it('updating an issued list raises DB_INVARIANT', async () => {
    const { listId } = await generate()
    await issue(listId)
    await expectDbError(
      handle.db
        .update(abutterLists)
        .set({ snapshot: { recipients: [] } })
        .where(eq(abutterLists.id, listId)),
      /E_DB_003/,
    )
    await expectDbError(
      handle.db.delete(abutterLists).where(eq(abutterLists.id, listId)),
      /E_DB_003/,
    )
  })

  it('the rows of an issued list cannot change', async () => {
    const { listId } = await generate()
    await issue(listId)
    await expectDbError(
      handle.db.update((await import('@/db/schema')).abutterListCandidates).set({ excluded: true }),
      /E_DB_003/,
    )
  })

  it('reimport after issue leaves the snapshot byte-identical', async () => {
    const { listId } = await generate()
    await issue(listId)
    const before = await currentIssuedList(handle.db, lw.applicationId, signal)
    await handle.db.execute(
      (await import('drizzle-orm'))
        .sql`update parcels set owner_name = 'Someone Else' where id = ${lw.ids.SW}`,
    )
    const after = await currentIssuedList(handle.db, lw.applicationId, signal)
    expect(JSON.stringify(after?.snapshot)).toBe(JSON.stringify(before?.snapshot))
    expect(after?.snapshotSha256).toBe(before?.snapshotSha256)
    const next = await generate()
    await issue(next.listId)
    const names = (
      await currentIssuedList(handle.db, lw.applicationId, signal)
    )?.snapshot.recipients.map((r) => r.name)
    expect(names).toContain('Someone Else')
    expect(names).not.toContain('Wren, Isolde')
  })

  it('professionals sealed on the plat join the list', async () => {
    await addProfessional(
      handle.db,
      world.staff,
      {
        applicationId: lw.applicationId,
        name: 'Rae Fenn',
        profession: 'land_surveyor',
        businessAddress: '8 Survey Row',
        sealOnPlat: true,
      },
      signal,
    )
    const { listId } = await generate()
    await issue(listId)
    const roles = (
      await currentIssuedList(handle.db, lw.applicationId, signal)
    )?.snapshot.recipients.map((r) => r.roles[0])
    expect(roles).toContain('sealed_professional')
  })
})

const LEGACY_SNAPSHOT = {
  application: {
    id: 'app-1',
    number: 'AP-0001',
    typeKey: 'pb-site-plan',
    receivedDate: '2026-12-01',
  },
  applicantParcelIds: ['p-1'],
  drawnOn: '2027-03-24',
  strategy: { key: 'adjacency', version: 1, params: { captureRadiusFt: 50 } },
  resolver: { key: 'owner', version: 1 },
  layers: { parcels: { state: 'ok' } },
  candidates: [{ parcelId: 'p-2', reasons: [] }],
  recipients: [],
} as unknown as ListSnapshot
const LEGACY_SNAPSHOT_SHA256 = '36c078c0a7b9c1ba5480394423fb574a5edb9a0ab4bf281797a8c09e56675eaf'

describe('snapshot settings and hash stability', () => {
  it('a newly issued list records the abutter settings and rehashes to its stored hash', async () => {
    const { listId } = await generate()
    await issue(listId)
    const issued = await currentIssuedList(handle.db, lw.applicationId, signal)
    expect(issued?.snapshot.settings).toEqual({
      projectionEnabled: true,
      assumedRightOfWayFt: 50,
      bufferFt: null,
    })
    expect(issued === null ? null : snapshotHash(issued.snapshot)).toBe(issued?.snapshotSha256)
  })

  it('records the town buffer when the pack uses one', async () => {
    setActivePackForTest(packWithTownBuffer({ defaultFt: null, maxFt: 500 }))
    const defaults = demoBoardSettings(await activeBoards(handle.db))
    await saveAndPublish(handle.db, world.admin, 'board_settings', 'default', {
      ...defaults,
      abutters: {
        ...defaults.abutters,
        projectionEnabled: true,
        layersConfirmedBy: 'Land Use Technician',
        layersConfirmedOn: '2027-02-01',
        bufferFt: 300,
      },
    })
    const { listId } = await generate()
    await issue(listId)
    const issued = await currentIssuedList(handle.db, lw.applicationId, signal)
    expect(issued?.snapshot.settings?.bufferFt).toBe(300)
    expect(issued === null ? null : snapshotHash(issued.snapshot)).toBe(issued?.snapshotSha256)
  })

  it('a snapshot issued before settings existed still hashes to its stored hash', () => {
    expect(LEGACY_SNAPSHOT.settings).toBeUndefined()
    expect(snapshotHash(LEGACY_SNAPSHOT)).toBe(LEGACY_SNAPSHOT_SHA256)
    expect(createHash('sha256').update(canonicalJson(LEGACY_SNAPSHOT)).digest('hex')).toBe(
      LEGACY_SNAPSHOT_SHA256,
    )
  })

  it('records the settings in force when the draft was generated, not when it is issued', async () => {
    const { listId } = await generate()
    const defaults = demoBoardSettings(await activeBoards(handle.db))
    await saveAndPublish(handle.db, world.admin, 'board_settings', 'default', {
      ...defaults,
      abutters: {
        ...defaults.abutters,
        projectionEnabled: true,
        layersConfirmedBy: 'Land Use Technician',
        layersConfirmedOn: '2027-02-01',
        assumedRightOfWayFt: 100,
      },
    })
    await issue(listId)
    const issued = await currentIssuedList(handle.db, lw.applicationId, signal)
    expect(issued?.snapshot.settings).toEqual({
      projectionEnabled: true,
      assumedRightOfWayFt: 50,
      bufferFt: null,
    })
  })

  it('omits settings for a draft generated before they were recorded', async () => {
    const { listId } = await generate()
    await handle.db.execute(
      sql`update abutter_lists set selection_settings = null where id = ${listId}`,
    )
    await issue(listId)
    const issued = await currentIssuedList(handle.db, lw.applicationId, signal)
    expect(issued?.snapshot.settings).toBeUndefined()
    expect(issued === null ? null : snapshotHash(issued.snapshot)).toBe(issued?.snapshotSha256)
  })

  it('draws the buffer saved with the list, not the current board buffer', async () => {
    setActivePackForTest(packWithTownBuffer({ defaultFt: null, maxFt: 500 }))
    const publishBuffer = async (bufferFt: number) => {
      const defaults = demoBoardSettings(await activeBoards(handle.db))
      await saveAndPublish(handle.db, world.admin, 'board_settings', 'default', {
        ...defaults,
        abutters: {
          ...defaults.abutters,
          projectionEnabled: true,
          layersConfirmedBy: 'Land Use Technician',
          layersConfirmedOn: '2027-02-01',
          bufferFt,
        },
      })
    }
    const outline = async (bufferFt: number) => {
      const feature = await handle.db.transaction((tx) =>
        bufferOverlay(tx, { applicantParcelIds: [lw.ids.A ?? ''], bufferFt }, signal),
      )
      return feature?.geometry
    }
    await publishBuffer(300)
    const { listId } = await generate()
    await publishBuffer(100)
    const view = await loadListView(handle.db, world.staff, listId, signal)
    const drawn = view?.overlay?.features.find((f) => f.properties.kind === 'buffer')?.geometry
    expect(drawn).toEqual(await outline(300))
    expect(drawn).not.toEqual(await outline(100))
  })

  it('loads the list view when a buffer is set and the applicant parcel has no geometry', async () => {
    setActivePackForTest(packWithTownBuffer({ defaultFt: 300, maxFt: 500 }))
    const { listId } = await generate()
    await handle.db.execute(sql`update parcels set geom = null where id = ${lw.ids.A}`)
    const view = await loadListView(handle.db, world.staff, listId, signal)
    expect(view).not.toBeNull()
  })
})
