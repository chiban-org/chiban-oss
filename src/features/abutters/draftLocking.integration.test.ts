import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { abutterListRecipients } from '@/db/schema'
import { correctRecipient, generateList } from '@/features/abutters/lists'
import { lockApplication } from '@/features/applications/lockApplication'
import { type BoardWorld, publishRegionalContacts, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'
import { blockedOrSettled, holdOpen } from '@/test/lockWait'

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

describe('draft edits and issuance', () => {
  it('a recipient correction waits for the application lock that issuance takes', async () => {
    const made = await generateList(
      handle.db,
      world.staff,
      { applicationId: lw.applicationId },
      signal,
      LIST_NOW,
    )
    if (!made.ok) throw new Error('generate failed')
    const [row] = await handle.db
      .select()
      .from(abutterListRecipients)
      .where(eq(abutterListRecipients.listId, made.value.listId))
    const issuing = await holdOpen(handle.db, (tx) => lockApplication(tx, lw.applicationId))
    const correcting = correctRecipient(
      handle.db,
      world.staff,
      {
        listId: made.value.listId,
        recipientId: row?.id ?? '',
        name: 'Corrected Owner',
        mailingAddress: '9 Heron Road, Alder Pond NH 03999',
        reason: 'Owner wrote with a new address',
      },
      signal,
      LIST_NOW,
    )
    const outcome = await blockedOrSettled(handle.db, correcting)
    await issuing.commit()
    expect(outcome).toBe('blocked')
    expect(await correcting).toEqual({ ok: true, value: undefined })
  })
})
