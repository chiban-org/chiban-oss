import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { abutterListRecipients, applications } from '@/db/schema'
import { issueList } from '@/features/abutters/issue'
import { correctRecipient, generateList } from '@/features/abutters/lists'
import type { Recipient } from '@/features/abutters/resolution'
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

describe('correcting the applicant', () => {
  it('correcting a missing applicant address clears the blocker so the list issues', async () => {
    await handle.db
      .update(applications)
      .set({ values: {} })
      .where(eq(applications.id, lw.applicationId))
    const made = await generateList(
      handle.db,
      world.staff,
      { applicationId: lw.applicationId },
      signal,
      LIST_NOW,
    )
    if (!made.ok) throw new Error('generate failed')
    const rows = await handle.db
      .select()
      .from(abutterListRecipients)
      .where(eq(abutterListRecipients.listId, made.value.listId))
    const applicant = rows.find((r) => (r.data as Recipient).roles.includes('applicant'))
    const corrected = await correctRecipient(
      handle.db,
      world.staff,
      {
        listId: made.value.listId,
        recipientId: applicant?.id ?? '',
        name: (applicant?.data as Recipient | undefined)?.name ?? '',
        mailingAddress: '12 Osprey Lane, Alder Pond NH 03999',
        reason: 'Applicant gave the address by phone',
      },
      signal,
      LIST_NOW,
    )
    expect(corrected).toEqual({ ok: true, value: undefined })
    expect(
      await issueList(handle.db, world.staff, { listId: made.value.listId }, signal, LIST_NOW),
    ).toMatchObject({ ok: true })
  })
})
