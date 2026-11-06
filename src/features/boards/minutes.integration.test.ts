import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { boardMeetings, meetingMinutes, renditionApprovals } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { recordMinutes } from '@/features/boards/minutes'
import { loadMeetingMinutes } from '@/features/boards/minutesView'
import { createUploadIntent } from '@/features/documents/uploads'
import { resolveRendition } from '@/features/documents/visibility'
import { loadPublicBoardRecords } from '@/features/hearings/publicRecords'
import { revokeApproval } from '@/features/renditions/approvals'
import { loadReleaseCandidates } from '@/features/rtk/requestPage'
import type { ObjectStore } from '@/features/storage/objectStore'
import { BOARD_FIXTURE_NOW, type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/minio'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: BoardWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { pbMeetings: ['2027-04-14', '2028-02-09'] })
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

async function meetingOn(date: string): Promise<string> {
  const [row] = await handle.db
    .select({ id: boardMeetings.id })
    .from(boardMeetings)
    .where(eq(boardMeetings.meetingDate, date))
  return row?.id ?? ''
}

async function minutesFile(meetingId: string, title = 'Minutes of April 14') {
  const made = await uploadAs(
    handle.db,
    store,
    world.staff,
    { kind: 'meeting', id: meetingId },
    pdfBytes(title),
    { title, filename: 'minutes.pdf' },
  )
  return made.documentId
}

async function record(
  actor: Actor,
  input: {
    meetingId: string
    documentId: string
    status: 'draft' | 'approved'
    approvedOn?: string
  },
) {
  return await recordMinutes(
    handle.db,
    actor,
    {
      meetingId: input.meetingId,
      documentId: input.documentId,
      status: input.status,
      approvedOn: input.approvedOn === undefined ? null : d(input.approvedOn),
    },
    signal,
    BOARD_FIXTURE_NOW,
  )
}

describe('meeting minutes', () => {
  it('draft minutes are kept on the meeting and stay off the public site', async () => {
    const meetingId = await meetingOn('2027-04-14')
    const documentId = await minutesFile(meetingId)
    expect(await record(world.staff, { meetingId, documentId, status: 'draft' })).toEqual({
      ok: true,
      value: undefined,
    })
    const view = await loadMeetingMinutes(handle.db, meetingId, signal, BOARD_FIXTURE_NOW)
    expect(view.current).toMatchObject({ documentId, status: 'draft', approvedText: null })
    expect((await resolveRendition(handle.db, null, documentId, signal)).ok).toBe(false)
    expect((await loadPublicBoardRecords(handle.db, signal)).minutes).toEqual([])
  })

  it('approved minutes carry their approval date and are public on the meetings page', async () => {
    const meetingId = await meetingOn('2027-04-14')
    const documentId = await minutesFile(meetingId)
    await record(world.staff, { meetingId, documentId, status: 'draft' })
    expect(
      (
        await record(world.staff, {
          meetingId,
          documentId,
          status: 'approved',
          approvedOn: '2027-04-28',
        })
      ).ok,
    ).toBe(true)
    const view = await loadMeetingMinutes(handle.db, meetingId, signal, BOARD_FIXTURE_NOW)
    expect(view.current).toMatchObject({ status: 'approved', approvedText: 'April 28, 2027' })
    expect((await resolveRendition(handle.db, null, documentId, signal)).ok).toBe(true)
    expect((await loadPublicBoardRecords(handle.db, signal)).minutes).toEqual([
      { meetingId, documentId, text: 'Planning Board, April 14, 2027, approved April 28, 2027' },
    ])
  })

  it('approved minutes leave the public meetings page once their public approval is revoked', async () => {
    const meetingId = await meetingOn('2027-04-14')
    const documentId = await minutesFile(meetingId)
    await record(world.staff, {
      meetingId,
      documentId,
      status: 'approved',
      approvedOn: '2027-04-28',
    })
    const [approval] = await handle.db
      .select({ id: renditionApprovals.id })
      .from(renditionApprovals)
      .where(eq(renditionApprovals.documentId, documentId))
    const revoked = await revokeApproval(
      handle.db,
      world.staff,
      { approvalId: approval?.id ?? '', reason: 'Names a private individual by mistake.' },
      signal,
    )
    expect(revoked.ok).toBe(true)
    expect((await resolveRendition(handle.db, null, documentId, signal)).ok).toBe(false)
    expect((await loadPublicBoardRecords(handle.db, signal)).minutes).toEqual([])
  })

  it('staff without board.record cannot attach or record minutes, even with document.manage', async () => {
    const meetingId = await meetingOn('2027-04-14')
    const documentId = await minutesFile(meetingId)
    const custodian = await staffActor(handle.db, 'records_custodian')
    const intent = await createUploadIntent(
      handle.db,
      store,
      custodian,
      {
        target: { kind: 'meeting', id: meetingId },
        title: 'Minutes',
        filename: 'minutes.pdf',
        contentType: 'application/pdf',
        sizeBytes: 10,
      },
      signal,
    )
    expect(intent).toEqual({ ok: false, error: 'forbidden' })
    expect(await record(custodian, { meetingId, documentId, status: 'draft' })).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await handle.db.select().from(meetingMinutes)).toEqual([])
  })

  it('approving minutes needs document.publish because it makes them public', async () => {
    const meetingId = await meetingOn('2027-04-14')
    const documentId = await minutesFile(meetingId)
    expect(
      await record(world.admin, {
        meetingId,
        documentId,
        status: 'approved',
        approvedOn: '2027-04-28',
      }),
    ).toEqual({ ok: false, error: 'forbidden' })
    expect((await record(world.admin, { meetingId, documentId, status: 'draft' })).ok).toBe(true)
  })

  it('approved minutes cannot be replaced', async () => {
    const meetingId = await meetingOn('2027-04-14')
    const documentId = await minutesFile(meetingId)
    await record(world.staff, {
      meetingId,
      documentId,
      status: 'approved',
      approvedOn: '2027-04-28',
    })
    const other = await minutesFile(meetingId, 'Corrected minutes')
    expect(await record(world.staff, { meetingId, documentId: other, status: 'draft' })).toEqual({
      ok: false,
      error: 'already_approved',
    })
  })

  it('minutes are refused for a meeting not yet held and for dates outside the meeting', async () => {
    const future = await meetingOn('2028-02-09')
    const held = await meetingOn('2027-04-14')
    const documentId = await minutesFile(held)
    expect((await record(world.staff, { meetingId: future, documentId, status: 'draft' })).ok).toBe(
      false,
    )
    expect(
      await record(world.staff, {
        meetingId: held,
        documentId,
        status: 'approved',
        approvedOn: '2027-04-01',
      }),
    ).toEqual({ ok: false, error: 'before_meeting' })
    expect(
      await record(world.staff, {
        meetingId: held,
        documentId,
        status: 'approved',
        approvedOn: '2028-01-04',
      }),
    ).toEqual({ ok: false, error: 'future_date' })
    expect(await record(world.staff, { meetingId: held, documentId, status: 'approved' })).toEqual({
      ok: false,
      error: 'approval_date_required',
    })
  })

  it('a document from another meeting cannot be recorded as the minutes', async () => {
    const held = await meetingOn('2027-04-14')
    const future = await meetingOn('2028-02-09')
    const documentId = await minutesFile(future)
    expect(await record(world.staff, { meetingId: held, documentId, status: 'draft' })).toEqual({
      ok: false,
      error: 'document_not_found',
    })
  })

  it('minutes attached to a meeting are found by the Right-to-Know release search', async () => {
    const meetingId = await meetingOn('2027-04-14')
    const documentId = await minutesFile(meetingId)
    const found = await loadReleaseCandidates(handle.db, world.staff, 'minutes')
    expect(found.map((c) => [c.documentId, c.context])).toContainEqual([
      documentId,
      'Board meeting',
    ])
  })
})
