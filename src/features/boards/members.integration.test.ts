import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  boardMemberships,
  boardPacketAccess,
  boardPacketItems,
  boardPacketLinks,
  documents,
  userRoles,
  users,
} from '@/db/schema'
import {
  buildAgenda,
  publishAgenda,
  removeAgendaItem,
  reopenAgenda,
} from '@/features/agendas/agendas'
import { createMeetingPacket } from '@/features/agendas/meetingPacket'
import { listApplicationsForViewer } from '@/features/applications/listForViewer'
import { type Actor, loadActor } from '@/features/auth/actor'
import {
  consumeMagicLink,
  requestMagicLink,
  resetMagicLinkLimiter,
} from '@/features/auth/magicLink'
import {
  getMemberPacket,
  listMemberMeetings,
  openMemberPacketVersion,
} from '@/features/boards/memberPackets'
import { endMembership, inviteBoardMember } from '@/features/boards/members'
import { sendPacketLink } from '@/features/boards/packetLinks'
import { resolveRendition } from '@/features/documents/visibility'
import { scheduleHearing } from '@/features/hearings/hearings'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import type { ObjectStore } from '@/features/storage/objectStore'
import {
  type BoardWorld,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { makeTestStore } from '@/test/minio'
import { issueListWithRecipients, proofDocument, recipient } from '@/test/noticeFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-04-10T16:00:00Z')
let handle: TestDb
let world: BoardWorld
let store: ObjectStore
let mail: ReturnType<typeof createMemoryTransport>

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
  store = (await makeTestStore()).store
  mail = createMemoryTransport()
  resetMagicLinkLimiter()
})
afterEach(async () => {
  await handle.drop()
})

async function invite(
  email: string,
  board: 'planning_board' | 'zba',
  extra: { termStart?: string; termEnd?: string } = {},
) {
  const invited = await inviteBoardMember(
    handle.db,
    mail,
    world.staff,
    {
      email,
      displayName: 'Member',
      board,
      title: 'member',
      termStart: d(extra.termStart ?? '2020-01-01'),
      ...(extra.termEnd === undefined ? {} : { termEnd: d(extra.termEnd) }),
    },
    signal,
  )
  if (!invited.ok) throw new Error(`invite failed: ${invited.error}`)
  const actor = await loadActor(handle.db, invited.value.userId, signal)
  if (actor === null) throw new Error('no actor')
  return { ...invited.value, actor }
}

async function meetingId(date: string, board: 'planning_board' | 'zba') {
  const rows = await handle.db.query.boardMeetings.findMany({
    where: (m, { and, eq: equals }) => and(equals(m.meetingDate, date), equals(m.board, board)),
  })
  return rows[0]?.id ?? ''
}

async function zbaHearingApplication() {
  const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
  await recordNoRegionalImpact(handle.db, world, id)
  await issueListWithRecipients(handle.db, world, id, [recipient(1)])
  const result = await scheduleHearing(
    handle.db,
    world.staff,
    { applicationId: id, meetingId: await meetingId('2027-04-15', 'zba'), kind: 'public_hearing' },
    signal,
  )
  if (!result.ok) throw new Error(JSON.stringify(result.error))
  return id
}

async function publishedZbaAgenda() {
  const applicationId = await zbaHearingApplication()
  const id = await meetingId('2027-04-15', 'zba')
  await buildAgenda(handle.db, world.staff, id, signal)
  await publishAgenda(handle.db, store, world.staff, id, signal)
  return { applicationId, meetingId: id }
}

async function seen(actor: Actor, limit = 25) {
  return (await listApplicationsForViewer(handle.db, actor, { limit }, signal)).rows.map(
    (r) => r.id,
  )
}

describe('board member application access', () => {
  it('zba member cannot see a planning board application', async () => {
    const zba = await invite('zba.member@alderpond.example', 'zba')
    const pbApp = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    await recordNoRegionalImpact(handle.db, world, pbApp)
    expect(await seen(zba.actor)).toEqual([])
  })

  it('a zba member sees a zba application only once the agenda is published', async () => {
    const zba = await invite('zba.member@alderpond.example', 'zba')
    const applicationId = await zbaHearingApplication()
    expect(await seen(zba.actor)).toEqual([])
    const id = await meetingId('2027-04-15', 'zba')
    await buildAgenda(handle.db, world.staff, id, signal)
    await publishAgenda(handle.db, store, world.staff, id, signal)
    expect(await seen(zba.actor)).toEqual([applicationId])
  })

  it('a planning board member does not see a zba application on a published agenda', async () => {
    const pb = await invite('pb.member@alderpond.example', 'planning_board')
    await publishedZbaAgenda()
    expect(await seen(pb.actor)).toEqual([])
  })

  it('ended term loses access', async () => {
    const zba = await invite('zba.member@alderpond.example', 'zba')
    const { applicationId } = await publishedZbaAgenda()
    expect(await seen(zba.actor)).toEqual([applicationId])
    const ended = await endMembership(handle.db, world.staff, zba.membershipId, signal)
    expect(ended.ok).toBe(true)
    expect(await seen(zba.actor)).toEqual([])
  })

  it('a term that has not started grants nothing yet', async () => {
    const zba = await invite('zba.member@alderpond.example', 'zba', { termStart: '2099-01-01' })
    await publishedZbaAgenda()
    expect(await seen(zba.actor)).toEqual([])
  })

  it('a term that ended last year grants nothing', async () => {
    const zba = await invite('zba.member@alderpond.example', 'zba', {
      termStart: '2020-01-01',
      termEnd: '2021-12-31',
    })
    await publishedZbaAgenda()
    expect(await seen(zba.actor)).toEqual([])
  })

  it('magic link for an uninvited email grants no board access', async () => {
    await publishedZbaAgenda()
    await requestMagicLink(handle.db, mail, 'stranger@example.test', signal)
    const link = mail.sent.at(-1)?.text.match(/token=([\w-]+)/)?.[1]
    if (link === undefined) throw new Error('no link')
    const consumed = await consumeMagicLink(handle.db, link, signal)
    if (!consumed.ok) throw new Error('consume failed')
    const actor = await loadActor(handle.db, consumed.value.userId, signal)
    if (actor === null) throw new Error('no actor')
    expect(actor.roles).not.toContain('board_member')
    expect(await seen(actor)).toEqual([])
    expect((await listMemberMeetings(handle.db, actor, { limit: 25 }, signal)).rows).toEqual([])
  })

  it('an invited member signs in with a magic link and sees the meeting', async () => {
    await publishedZbaAgenda()
    await invite('zba.member@alderpond.example', 'zba')
    await requestMagicLink(handle.db, mail, 'zba.member@alderpond.example', signal)
    const link = mail.sent.at(-1)?.text.match(/token=([\w-]+)/)?.[1]
    const consumed = await consumeMagicLink(handle.db, link ?? '', signal)
    if (!consumed.ok) throw new Error('consume failed')
    const actor = await loadActor(handle.db, consumed.value.userId, signal)
    if (actor === null) throw new Error('no actor')
    expect((await listMemberMeetings(handle.db, actor, { limit: 25 }, signal)).rows).toHaveLength(1)
  })

  it('member sees 2 of 30 applications with limit 25', async () => {
    const zba = await invite('zba.member@alderpond.example', 'zba')
    const { applicationId } = await publishedZbaAgenda()
    for (let i = 0; i < 29; i += 1) {
      await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
    }
    const second = await zbaHearingApplication()
    const id = await meetingId('2027-04-15', 'zba')
    await reopenAgenda(handle.db, world.staff, id, signal)
    await buildAgenda(handle.db, world.staff, id, signal)
    await publishAgenda(handle.db, store, world.staff, id, signal)
    const rows = await seen(zba.actor, 25)
    expect(rows.sort()).toEqual([applicationId, second].sort())
  })
})

describe('agenda scoping', () => {
  it('an application removed from the published agenda stays hidden from members', async () => {
    const zba = await invite('zba.member@alderpond.example', 'zba')
    const first = await zbaHearingApplication()
    const second = await zbaHearingApplication()
    const id = await meetingId('2027-04-15', 'zba')
    await buildAgenda(handle.db, world.staff, id, signal)
    const items = await handle.db.query.agendaItems.findMany({
      where: (i, { eq: equals }) => equals(i.meetingId, id),
    })
    const secondItem = items.find(
      (i) => i.title.includes('VAR') && i.hearingId !== null && i.id !== items[0]?.id,
    )
    await removeAgendaItem(handle.db, world.staff, secondItem?.id ?? '', signal)
    await publishAgenda(handle.db, store, world.staff, id, signal)
    const visible = await seen(zba.actor)
    expect(visible).toHaveLength(1)
    expect([first, second]).toContain(visible[0])
    const hiddenApp = visible[0] === first ? second : first
    const doc = await proofDocument(handle.db, world, hiddenApp)
    await handle.db
      .update(documents)
      .set({ audiences: ['board'] })
      .where(eq(documents.id, doc))
    expect((await resolveRendition(handle.db, zba.actor, doc, signal)).ok).toBe(false)
  })
})

describe('inviting members', () => {
  it('inviting a staff email is staff_account', async () => {
    const email = 'clerk@alderpond.example'
    await makeUser(handle.db, { email, role: 'staff' })
    const result = await inviteBoardMember(
      handle.db,
      mail,
      world.staff,
      { email, displayName: 'Clerk', board: 'zba', title: 'clerk', termStart: d('2027-01-01') },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'staff_account' })
    const staffUser = await handle.db.query.users.findFirst({
      where: (u, { eq: equals }) => equals(u.email, email),
    })
    expect(
      (await handle.db.select().from(boardMemberships)).filter((m) => m.userId === staffUser?.id),
    ).toEqual([])
  })

  it('staff without board.manage_members inviting is forbidden', async () => {
    const inspector = await loadActor(
      handle.db,
      await makeUser(handle.db, { role: 'inspector' }),
      signal,
    )
    if (inspector === null) throw new Error('no actor')
    const result = await inviteBoardMember(
      handle.db,
      mail,
      inspector,
      {
        email: 'x@alderpond.example',
        displayName: 'X',
        board: 'zba',
        title: 'member',
        termStart: d('2027-01-01'),
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(
      await handle.db.select().from(users).where(eq(users.email, 'x@alderpond.example')),
    ).toEqual([])
  })

  it('an invitation creates a public user with only the board_member role and emails no token', async () => {
    const member = await invite('New.Member@AlderPond.example', 'planning_board')
    const [user] = await handle.db.select().from(users).where(eq(users.id, member.userId))
    expect(user).toMatchObject({ kind: 'public', email: 'new.member@alderpond.example' })
    const roles = await handle.db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, member.userId))
    expect(roles.map((r) => r.role)).toEqual(['board_member'])
    const message = mail.sent.at(-1)
    expect(message?.to).toBe('new.member@alderpond.example')
    expect(message?.text).toContain('/board')
    expect(message?.text).not.toContain('token')
  })

  it('inviting the same member to the other board reuses the account', async () => {
    const first = await invite('both@alderpond.example', 'zba')
    const second = await invite('both@alderpond.example', 'planning_board')
    expect(second.userId).toBe(first.userId)
    expect(
      (await handle.db.select().from(boardMemberships)).filter((m) => m.userId === first.userId),
    ).toHaveLength(2)
  })

  it('ending a membership that does not exist is not_found and a reviewer cannot end one', async () => {
    const member = await invite('m@alderpond.example', 'zba')
    expect(
      await endMembership(handle.db, world.staff, '00000000-0000-4000-8000-000000000000', signal),
    ).toEqual({ ok: false, error: 'not_found' })
    expect(await endMembership(handle.db, world.reviewer, member.membershipId, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

describe('packets for members', () => {
  async function packet() {
    const { applicationId, meetingId: id } = await publishedZbaAgenda()
    const boardDoc = await proofDocument(handle.db, world, applicationId)
    await handle.db
      .update(documents)
      .set({ audiences: ['board'] })
      .where(eq(documents.id, boardDoc))
    const made = await createMeetingPacket(handle.db, store, world.staff, id, signal)
    if (!made.ok) throw new Error(JSON.stringify(made.error))
    return { applicationId, meetingId: id, boardDoc, packetId: made.value.packetId }
  }

  it('packet send to an active member uses the account and mints no token', async () => {
    await invite('zba.member@alderpond.example', 'zba')
    const { packetId } = await packet()
    const sent = await sendPacketLink(
      handle.db,
      mail,
      world.staff,
      { packetId, recipientName: 'Member', recipientEmail: 'ZBA.member@alderpond.example' },
      signal,
      NOW,
    )
    expect(sent).toEqual({ ok: true, value: { linkId: null, viaAccount: true } })
    expect(await handle.db.select().from(boardPacketLinks)).toEqual([])
    expect(mail.sent.at(-1)?.text).toContain('Packet ready: sign in at')
    expect(mail.sent.at(-1)?.text).toContain('/board')
  })

  it('packet send to a non-member still mints a link', async () => {
    const { packetId } = await packet()
    const sent = await sendPacketLink(
      handle.db,
      mail,
      world.staff,
      { packetId, recipientName: 'Guest', recipientEmail: 'guest@example.test' },
      signal,
      NOW,
    )
    expect(sent.ok && sent.value.viaAccount).toBe(false)
    expect(await handle.db.select().from(boardPacketLinks)).toHaveLength(1)
  })

  it('packet send to a member of the other board still mints a link', async () => {
    await invite('pb.member@alderpond.example', 'planning_board')
    const { packetId } = await packet()
    const sent = await sendPacketLink(
      handle.db,
      mail,
      world.staff,
      { packetId, recipientName: 'PB', recipientEmail: 'pb.member@alderpond.example' },
      signal,
      NOW,
    )
    expect(sent.ok && sent.value.viaAccount).toBe(false)
  })

  it('a member opens the packet of their own board and nothing else', async () => {
    const zba = await invite('zba.member@alderpond.example', 'zba')
    const pb = await invite('pb.member@alderpond.example', 'planning_board')
    const { meetingId: id, boardDoc } = await packet()
    const view = await getMemberPacket(handle.db, zba.actor, id, signal)
    if (!view.ok) throw new Error('no packet')
    expect(view.value.items.length).toBeGreaterThan(0)
    expect(await getMemberPacket(handle.db, pb.actor, id, signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
    const visible = await resolveRendition(handle.db, zba.actor, boardDoc, signal)
    expect(visible.ok).toBe(true)
    expect((await resolveRendition(handle.db, pb.actor, boardDoc, signal)).ok).toBe(false)
  })

  it('an unpublished agenda hides the packet from the member', async () => {
    const zba = await invite('zba.member@alderpond.example', 'zba')
    const { meetingId: id } = await packet()
    await handle.db.execute(`update agendas set status = 'draft' where meeting_id = '${id}'`)
    expect(await getMemberPacket(handle.db, zba.actor, id, signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect((await listMemberMeetings(handle.db, zba.actor, { limit: 25 }, signal)).rows).toEqual([])
  })

  it('member document access is logged with user_id', async () => {
    const zba = await invite('zba.member@alderpond.example', 'zba')
    const { meetingId: id } = await packet()
    const view = await getMemberPacket(handle.db, zba.actor, id, signal)
    if (!view.ok) throw new Error('no packet')
    const item = view.value.items[0]
    const opened = await openMemberPacketVersion(
      handle.db,
      zba.actor,
      { meetingId: id, versionId: item?.versionId ?? '' },
      signal,
    )
    expect(opened.ok && opened.value.storageKey.length).toBeGreaterThan(0)
    const rows = await handle.db.select().from(boardPacketAccess)
    expect(
      rows.some(
        (r) => r.userId === zba.userId && r.versionId === item?.versionId && r.linkId === null,
      ),
    ).toBe(true)
  })

  it('a withdrawn packet item is listed as withdrawn and refused to the member', async () => {
    const zba = await invite('zba.member@alderpond.example', 'zba')
    const { meetingId: id } = await packet()
    const before = await getMemberPacket(handle.db, zba.actor, id, signal)
    if (!before.ok) throw new Error('no packet')
    const versionId = before.value.items[0]?.versionId ?? ''
    await handle.db
      .update(boardPacketItems)
      .set({ withdrawnAt: NOW, withdrawnReason: 'revoked' })
      .where(eq(boardPacketItems.versionId, versionId))
    const after = await getMemberPacket(handle.db, zba.actor, id, signal)
    if (!after.ok) throw new Error('no packet')
    expect(after.value.items.find((i) => i.versionId === versionId)?.withdrawnOn).toBe('2027-04-10')
    const opened = await openMemberPacketVersion(
      handle.db,
      zba.actor,
      { meetingId: id, versionId },
      signal,
    )
    expect(opened).toEqual({ ok: false, error: { withdrawnOn: '2027-04-10' } })
  })

  it('a disposed packet item keeps its place under its former version', async () => {
    const zba = await invite('zba.member@alderpond.example', 'zba')
    const { meetingId: id } = await packet()
    const before = await getMemberPacket(handle.db, zba.actor, id, signal)
    if (!before.ok) throw new Error('no packet')
    const versionId = before.value.items[0]?.versionId ?? ''
    await handle.db
      .update(boardPacketItems)
      .set({
        versionId: null,
        formerVersionId: versionId,
        withdrawnAt: NOW,
        withdrawnReason: 'disposed',
      })
      .where(eq(boardPacketItems.versionId, versionId))
    const after = await getMemberPacket(handle.db, zba.actor, id, signal)
    if (!after.ok) throw new Error('no packet')
    expect(after.value.items.map((i) => i.versionId)).toEqual(
      before.value.items.map((i) => i.versionId),
    )
    const opened = await openMemberPacketVersion(
      handle.db,
      zba.actor,
      { meetingId: id, versionId },
      signal,
    )
    expect(opened).toEqual({ ok: false, error: { withdrawnOn: '2027-04-10' } })
  })

  it('a version outside the packet is not_found for the member', async () => {
    const zba = await invite('zba.member@alderpond.example', 'zba')
    const { meetingId: id } = await packet()
    const opened = await openMemberPacketVersion(
      handle.db,
      zba.actor,
      { meetingId: id, versionId: '00000000-0000-4000-8000-000000000000' },
      signal,
    )
    expect(opened).toEqual({ ok: false, error: 'not_found' })
  })

  it('the member meeting list shows only the own board meetings, newest first', async () => {
    const zba = await invite('zba.member@alderpond.example', 'zba')
    await packet()
    const list = await listMemberMeetings(handle.db, zba.actor, { limit: 25 }, signal)
    expect(list.rows.map((r) => [r.board, r.meetingDate, r.hasPacket])).toEqual([
      ['zba', '2027-04-15', true],
    ])
  })
})
