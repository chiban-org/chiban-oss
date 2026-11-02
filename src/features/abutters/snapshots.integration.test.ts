import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { abutterLists, remediationTasks } from '@/db/schema'
import { issueList } from '@/features/abutters/issue'
import {
  attestCrossings,
  correctRecipient,
  decideTenant,
  excludeCandidate,
  generateList,
  selectParcel,
} from '@/features/abutters/lists'
import { currentIssuedList } from '@/features/abutters/queries'
import { recordBoardRegionalImpact } from '@/features/boards/regionalImpact'
import { upsertPark } from '@/features/rosters/parks'
import { addProfessional } from '@/features/rosters/professionals'
import { type BoardWorld, publishRegionalContacts, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { expectDbError } from '@/test/dbErrors'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
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
