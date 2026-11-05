import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { boardMeetings, hearings, noticeSets, remediationTasks } from '@/db/schema'
import { issueList } from '@/features/abutters/issue'
import { decideTenant, generateList } from '@/features/abutters/lists'
import { currentIssuedList } from '@/features/abutters/queries'
import type { Recipient } from '@/features/abutters/resolution'
import { type AssociationInput, upsertAssociation } from '@/features/rosters/associations'
import { confirmEntry } from '@/features/rosters/confirm'
import { upsertPark } from '@/features/rosters/parks'
import { endRestriction, undoRestrictionEnd } from '@/features/rosters/restrictionEnd'
import { addRestriction } from '@/features/rosters/restrictions'
import { listsUsing } from '@/features/rosters/usedBy'
import { type BoardWorld, publishRegionalContacts, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'
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
  await handle.drop()
})

function association(patch: Partial<AssociationInput> = {}): AssociationInput {
  return {
    parcelId: lw.ids.SW ?? '',
    associationName: 'Pond View Condominium',
    officers: [
      { name: 'Dana Whitcomb', title: 'President', mailingAddress: 'PO Box 105, Alder Pond NH' },
    ],
    asOf: '2027-02-01' as CivilDate,
    now: LIST_NOW,
    ...patch,
  }
}

async function saveAssociation(patch: Partial<AssociationInput> = {}): Promise<string> {
  const saved = await upsertAssociation(handle.db, world.staff, association(patch), signal)
  if (!saved.ok) throw new Error(saved.error)
  const row = await handle.db.query.associationRosters.findFirst()
  return row?.id ?? ''
}

async function generate(): Promise<string> {
  const made = await generateList(
    handle.db,
    world.staff,
    { applicationId: lw.applicationId },
    signal,
    LIST_NOW,
  )
  if (!made.ok) throw new Error(JSON.stringify(made.error))
  return made.value.listId
}

async function issued(): Promise<Recipient | undefined> {
  const list = await currentIssuedList(handle.db, lw.applicationId, signal)
  return list?.snapshot.recipients.find((r) => r.name === 'Dana Whitcomb')
}

async function regenerationTasks() {
  return await handle.db
    .select()
    .from(remediationTasks)
    .where(
      and(
        eq(remediationTasks.applicationId, lw.applicationId),
        eq(remediationTasks.kind, 'regenerate_abutter_list'),
        eq(remediationTasks.status, 'open'),
      ),
    )
}

async function hearingOn(meetingDate: string, status: 'scheduled' | 'held'): Promise<void> {
  const meeting = await handle.db.query.boardMeetings.findFirst({
    where: eq(boardMeetings.meetingDate, meetingDate),
  })
  const [set] = await handle.db
    .insert(noticeSets)
    .values({
      subjectKind: 'hearing',
      subjectId: lw.applicationId,
      applicationId: lw.applicationId,
      anchorDate: meetingDate,
    })
    .returning({ id: noticeSets.id })
  await handle.db.insert(hearings).values({
    applicationId: lw.applicationId,
    meetingId: meeting?.id ?? '',
    kind: 'public_hearing',
    status,
    noticeSetId: set?.id ?? '',
    heldOn: status === 'held' ? meetingDate : null,
    createdBy: world.staff.userId,
  })
}

describe('a notice contact past its re-check interval', () => {
  it('still issues, and the issued list prints it as out of date', async () => {
    await saveAssociation({
      asOf: '2025-06-01' as CivilDate,
      now: new Date('2025-06-01T16:00:00Z'),
    })
    const listId = await generate()
    const result = await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)
    expect(result.ok).toBe(true)
    expect((await issued())?.provenance[0]).toMatchObject({
      source: 'association_roster',
      state: 'stale',
    })
  })

  it('reads as current again once someone confirms it is still correct', async () => {
    const id = await saveAssociation({
      asOf: '2025-06-01' as CivilDate,
      now: new Date('2025-06-01T16:00:00Z'),
    })
    const confirmed = await confirmEntry(
      handle.db,
      world.staff,
      { kind: 'association', entryId: id, now: LIST_NOW },
      signal,
    )
    expect(confirmed).toEqual({ ok: true, value: { checkedOn: '2027-03-24' } })
    const listId = await generate()
    expect((await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)).ok).toBe(true)
    expect((await issued())?.provenance[0]).toMatchObject({
      asOf: '2025-06-01',
      checkedOn: '2027-03-24',
      state: 'fresh',
    })
  })
})

describe('used by', () => {
  it('counts the draft and then the issued list that name the association', async () => {
    const id = await saveAssociation()
    const listId = await generate()
    expect((await listsUsing(handle.db, [id], signal)).get(id)).toMatchObject([
      { listId, applicationId: lw.applicationId, status: 'draft' },
    ])
    await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)
    const uses = (await listsUsing(handle.db, [id], signal)).get(id) ?? []
    expect(uses.map((u) => u.status)).toEqual(['issued'])
    expect(uses[0]?.applicationNumber).not.toBe('')
  })
})

describe('changing a contact an issued list used', () => {
  async function issueWithAssociation(): Promise<string> {
    const id = await saveAssociation()
    const listId = await generate()
    await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)
    return id
  }

  const newOfficer = {
    officers: [
      { name: 'Lee Marsh', title: 'President', mailingAddress: 'PO Box 106, Alder Pond NH' },
    ],
  }

  it('asks to regenerate the list when the hearing is still ahead', async () => {
    await issueWithAssociation()
    await hearingOn('2027-04-14', 'scheduled')
    await saveAssociation(newOfficer)
    const tasks = await regenerationTasks()
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.description).toBe(
      'Regenerate the abutter list: a notice contact on it changed',
    )
  })

  it('leaves an application alone once its hearing was held', async () => {
    await issueWithAssociation()
    await hearingOn('2027-03-10', 'held')
    await saveAssociation(newOfficer)
    expect(await regenerationTasks()).toEqual([])
  })

  it('does not ask when the contact is only confirmed or saved unchanged', async () => {
    const id = await issueWithAssociation()
    await confirmEntry(handle.db, world.staff, { kind: 'association', entryId: id }, signal)
    await saveAssociation()
    expect(await regenerationTasks()).toEqual([])
  })
})

describe('codex findings', () => {
  it('does not ask to regenerate when a park is saved again unchanged', async () => {
    const park = {
      parcelId: lw.ids.SW ?? '',
      parkName: 'Heron Park',
      ownerName: 'Heron Park LLC',
      ownerMailingAddress: '1 Heron Road, Alder Pond NH',
      asOf: '2027-02-01' as CivilDate,
      now: LIST_NOW,
    }
    await upsertPark(
      handle.db,
      world.staff,
      {
        ...park,
        tenants: [
          { tenantId: 's4', name: 'Lee Marsh', siteLabel: 'Site 4', mailingAddress: '4 Heron' },
        ],
      },
      signal,
    )
    const listId = await generate()
    const tenant = (await handle.db.query.abutterListRecipients.findMany()).find(
      (r) => (r.data as Recipient).name === 'Lee Marsh',
    )
    await decideTenant(
      handle.db,
      world.staff,
      { listId, recipientId: tenant?.id ?? '', qualifies: true, reason: 'Adjoins' },
      signal,
      LIST_NOW,
    )
    expect((await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)).ok).toBe(true)
    await hearingOn('2027-04-14', 'scheduled')
    await upsertPark(
      handle.db,
      world.staff,
      {
        ...park,
        tenants: [
          { tenantId: 's4', name: 'Lee Marsh', siteLabel: 'Site 4', mailingAddress: '4 Heron' },
        ],
      },
      signal,
    )
    expect(await regenerationTasks()).toEqual([])
  })

  it('keeps Undo while a list issued after a future ending still names the holder', async () => {
    const added = await addRestriction(
      handle.db,
      world.staff,
      {
        parcelId: lw.ids.A ?? '',
        holderName: 'Alder Valley Land Trust',
        holderMailingAddress: '2 Trust Lane, Alder Pond NH',
        restrictionKind: 'conservation',
        recordedReference: 'Book 412, Page 88',
      },
      signal,
    )
    const holdingId = added.ok ? added.value.holdingId : ''
    await endRestriction(
      handle.db,
      world.staff,
      { holdingId, endedOn: '2027-12-31' as CivilDate, now: new Date('2027-03-20T16:00:00Z') },
      signal,
    )
    const listId = await generate()
    expect((await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)).ok).toBe(true)
    const list = await currentIssuedList(handle.db, lw.applicationId, signal)
    expect(list?.snapshot.recipients.map((r) => r.name)).toContain('Alder Valley Land Trust')
    expect(await undoRestrictionEnd(handle.db, world.staff, { holdingId }, signal)).toEqual({
      ok: true,
      value: undefined,
    })
  })
})
