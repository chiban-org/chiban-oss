import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { abutterLists, parcels } from '@/db/schema'
import { setApplicantParcels } from '@/features/abutters/applicantParcels'
import type { StoredIncomplete } from '@/features/abutters/draft'
import { issueList } from '@/features/abutters/issue'
import { attestCrossings, generateList } from '@/features/abutters/lists'
import { BOARD_SETTINGS_DEFAULT } from '@/features/boards/boardSettingsSchema'
import { type BoardWorld, publishRegionalContacts, setupBoardWorld } from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'

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
  await handle.drop()
})

async function unmap(name: string) {
  await handle.db
    .update(parcels)
    .set({ geom: null })
    .where(eq(parcels.id, lw.ids[name] ?? ''))
}

async function draft(): Promise<string> {
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

describe('an applicant parcel without geometry', () => {
  it('with projection off, attesting crossings does not let the list issue', async () => {
    await saveAndPublish(
      handle.db,
      world.admin,
      'board_settings',
      'default',
      BOARD_SETTINGS_DEFAULT,
    )
    await unmap('A')
    const listId = await draft()
    await attestCrossings(handle.db, world.staff, { listId }, signal, LIST_NOW)
    const issued = await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)
    expect(issued).toMatchObject({
      ok: false,
      error: { incomplete: [expect.objectContaining({ code: 'applicant_parcel_unmapped' })] },
    })
  })

  it('with projection on, a mixed parcel set records the unmapped parcel on the draft', async () => {
    await setApplicantParcels(
      handle.db,
      world.staff,
      { applicationId: lw.applicationId, parcelIds: [lw.ids.A ?? '', lw.ids.M6 ?? ''] },
      signal,
    )
    await unmap('M6')
    const listId = await draft()
    const [row] = await handle.db.select().from(abutterLists).where(eq(abutterLists.id, listId))
    expect((row?.incomplete as StoredIncomplete).strategy).toContainEqual(
      expect.objectContaining({ code: 'applicant_parcel_unmapped', parcelId: lw.ids.M6 }),
    )
  })
  it('with projection on, a single unmapped parcel still draws a list that cannot issue', async () => {
    await unmap('A')
    const listId = await draft()
    expect(await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)).toMatchObject({
      ok: false,
      error: { incomplete: [expect.objectContaining({ code: 'applicant_parcel_unmapped' })] },
    })
  })
})
