import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { noticeItems, noticeProofSupersessions, noticeProofs } from '@/db/schema'
import { BOARD_SETTINGS_DEFAULT } from '@/features/boards/boardSettingsSchema'
import { deriveNoticeItems } from '@/features/notices/deriveItems'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { recordProof } from '@/features/notices/proofs'
import {
  type BoardWorld,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  issueListWithRecipients,
  proofDocument,
  recipient,
  recordDesProximity,
} from '@/test/noticeFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-04-10T16:00:00Z')
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function pbApplication(
  options: { regional?: 'yes' | 'no'; des?: 'within_500ft' | 'not_within' } = {},
) {
  const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
  await recordNoRegionalImpact(handle.db, world, id, options.regional ?? 'no')
  await recordDesProximity(handle.db, world, id, options.des ?? 'not_within')
  return id
}

async function zbaApplication(regional: 'yes' | 'no' = 'no') {
  const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
  await recordNoRegionalImpact(handle.db, world, id, regional)
  return id
}

async function derive(applicationId: string, anchor: string) {
  return await handle.db.transaction((tx) =>
    deriveNoticeItems(
      tx,
      { subjectKind: 'hearing', subjectId: randomUUID(), applicationId, anchorDate: d(anchor) },
      signal,
    ),
  )
}

async function itemsOf(setId: string) {
  return await handle.db.select().from(noticeItems).where(eq(noticeItems.setId, setId))
}

async function setFor(applicationId: string, anchor: string) {
  const derived = await derive(applicationId, anchor)
  if (!derived.ok) throw new Error(`derive failed: ${derived.error}`)
  return derived.value.setId
}

describe('deriveNoticeItems', () => {
  it('pb hearing on 2027-04-14 derives verified mail items due 2027-04-04 for every list recipient', async () => {
    const id = await pbApplication()
    await issueListWithRecipients(handle.db, world, id, [recipient(1), recipient(2), recipient(3)])
    const items = await itemsOf(await setFor(id, '2027-04-14'))
    const mail = items.filter((i) => i.requirementKey === 'nh.pb.notice_req.mail')
    expect(mail.map((i) => i.recipientName).sort()).toEqual([
      'Recipient 1',
      'Recipient 2',
      'Recipient 3',
    ])
    expect(mail.every((i) => i.channel === 'verified_mail' && i.dueOn === '2027-04-04')).toBe(true)
    expect(mail.every((i) => i.source === 'pack_rule')).toBe(true)
  })

  it('zba hearing on 2027-04-15 derives mail and newspaper items due 2027-04-10', async () => {
    const id = await zbaApplication()
    await issueListWithRecipients(handle.db, world, id, [recipient(1)])
    const items = await itemsOf(await setFor(id, '2027-04-15'))
    const byKey = Object.fromEntries(items.map((i) => [i.requirementKey, i]))
    expect(byKey['nh.zba.notice_req.mail']).toMatchObject({
      channel: 'verified_mail',
      dueOn: '2027-04-10',
    })
    expect(byKey['nh.zba.notice_req.newspaper']).toMatchObject({
      channel: 'newspaper',
      dueOn: '2027-04-10',
    })
  })

  it('regional impact adds certified items due 2027-03-31 for a hearing on 2027-04-14', async () => {
    const id = await pbApplication({ regional: 'yes' })
    await issueListWithRecipients(handle.db, world, id, [
      recipient(1),
      recipient(2, ['regional_planning_commission']),
      recipient(3, ['affected_municipality']),
    ])
    const items = await itemsOf(await setFor(id, '2027-04-14'))
    const certified = items.filter((i) => i.requirementKey === 'nh.ri.notice_req.certified')
    expect(certified.map((i) => i.recipientName).sort()).toEqual(['Recipient 2', 'Recipient 3'])
    expect(certified.every((i) => i.channel === 'certified_mail' && i.dueOn === '2027-03-31')).toBe(
      true,
    )
  })

  it('des within adds a first class item with the abutter due date', async () => {
    const id = await pbApplication({ des: 'within_500ft' })
    await issueListWithRecipients(handle.db, world, id, [recipient(1), recipient(2, ['nh_des'])])
    const items = await itemsOf(await setFor(id, '2027-04-14'))
    const des = items.filter((i) => i.requirementKey === 'nh.pb.notice_req.des')
    expect(des).toHaveLength(1)
    expect(des[0]).toMatchObject({ channel: 'first_class_mail', dueOn: '2027-04-04' })
  })

  it('town bulletin boards add one posting item each with source town_setting', async () => {
    const id = await pbApplication()
    await issueListWithRecipients(handle.db, world, id, [recipient(1)])
    const items = await itemsOf(await setFor(id, '2027-04-14'))
    const boards = items.filter((i) => i.channel === 'bulletin_board')
    expect(boards.map((i) => i.recipientName).sort()).toEqual(
      [...(BOARD_SETTINGS_DEFAULT.boards[0]?.publicNotice.bulletinBoards ?? [])].sort(),
    )
    expect(boards.every((i) => i.source === 'town_setting')).toBe(true)
  })

  it('a town website adds one website item', async () => {
    const board = BOARD_SETTINGS_DEFAULT.boards.map((b) =>
      b.board === 'planning_board'
        ? { ...b, publicNotice: { ...b.publicNotice, websiteUrl: 'https://alderpond.example.org' } }
        : b,
    )
    await saveAndPublish(handle.db, world.admin, 'board_settings', 'default', {
      ...BOARD_SETTINGS_DEFAULT,
      boards: board,
    })
    const id = await pbApplication()
    await issueListWithRecipients(handle.db, world, id, [recipient(1)])
    const items = await itemsOf(await setFor(id, '2027-04-14'))
    expect(items.filter((i) => i.channel === 'website')).toHaveLength(1)
  })

  it('town minimum of 14 days for pb mail moves due to 2027-03-31', async () => {
    await saveAndPublish(handle.db, world.admin, 'town_rule_setting', 'nh.pb.notice.mail', {
      ruleKey: 'nh.pb.notice.mail',
      value: 14,
      adoptingAuthority: 'Planning Board',
      adoptedOn: '2027-01-12',
    })
    const id = await pbApplication()
    await issueListWithRecipients(handle.db, world, id, [recipient(1)])
    const items = await itemsOf(await setFor(id, '2027-04-14'))
    const mail = items.find((i) => i.requirementKey === 'nh.pb.notice_req.mail')
    expect(mail?.dueOn).toBe('2027-03-31')
    expect(mail?.countingMethod).toContain('14')
  })

  it('without an issued list the result is no_issued_list', async () => {
    const id = await pbApplication()
    expect(await derive(id, '2027-04-14')).toEqual({ ok: false, error: 'no_issued_list' })
  })

  it('without a regional impact determination the result is determination_missing', async () => {
    const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
    await issueListWithRecipients(handle.db, world, id, [recipient(1)])
    expect(await derive(id, '2027-04-15')).toEqual({ ok: false, error: 'determination_missing' })
  })
})

async function zbaMailItems(recipients: number) {
  const id = await zbaApplication()
  await issueListWithRecipients(
    handle.db,
    world,
    id,
    Array.from({ length: recipients }, (_, i) => recipient(i + 1)),
  )
  const setId = await setFor(id, '2027-04-15')
  const items = await itemsOf(setId)
  return { id, setId, items, mail: items.filter((i) => i.channel === 'verified_mail') }
}

describe('recordProof', () => {
  it('certificate of mailing without reference proves verified mail', async () => {
    const { id, setId, mail } = await zbaMailItems(1)
    const documentId = await proofDocument(handle.db, world, id)
    const result = await recordProof(
      handle.db,
      world.staff,
      {
        itemIds: mail.map((i) => i.id),
        method: 'certificate_of_mailing',
        reference: null,
        effectiveOn: d('2027-04-08'),
        documentId,
      },
      signal,
      NOW,
    )
    expect(result.ok).toBe(true)
    const status = await noticeStatus(handle.db, setId, signal)
    expect(status.items.find((i) => i.channel === 'verified_mail')?.state).toBe('proved_on_time')
  })

  it('certified channel refuses a certificate of mailing', async () => {
    const id = await pbApplication({ regional: 'yes' })
    await issueListWithRecipients(handle.db, world, id, [
      recipient(1, ['regional_planning_commission']),
    ])
    const items = await itemsOf(await setFor(id, '2027-04-14'))
    const certified = items.filter((i) => i.channel === 'certified_mail')
    const documentId = await proofDocument(handle.db, world, id)
    const result = await recordProof(
      handle.db,
      world.staff,
      {
        itemIds: certified.map((i) => i.id),
        method: 'certificate_of_mailing',
        reference: null,
        effectiveOn: d('2027-03-30'),
        documentId,
      },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'method_not_allowed' })
  })

  it('certified mail without a reference is reference_required', async () => {
    const { id, mail } = await zbaMailItems(1)
    const documentId = await proofDocument(handle.db, world, id)
    const result = await recordProof(
      handle.db,
      world.staff,
      {
        itemIds: mail.map((i) => i.id),
        method: 'certified_mail',
        reference: '  ',
        effectiveOn: d('2027-04-08'),
        documentId,
      },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'reference_required' })
    expect(await handle.db.select().from(noticeProofs)).toEqual([])
  })

  it('a proof dated after the due date is proved_late', async () => {
    const { id, setId, mail } = await zbaMailItems(1)
    const documentId = await proofDocument(handle.db, world, id)
    await recordProof(
      handle.db,
      world.staff,
      {
        itemIds: mail.map((i) => i.id),
        method: 'certificate_of_mailing',
        reference: null,
        effectiveOn: d('2027-04-11'),
        documentId,
      },
      signal,
      new Date('2027-04-12T16:00:00Z'),
    )
    const status = await noticeStatus(handle.db, setId, signal)
    expect(status.items.find((i) => i.channel === 'verified_mail')?.state).toBe('proved_late')
  })

  it('a date in the future is refused', async () => {
    const { id, mail } = await zbaMailItems(1)
    const documentId = await proofDocument(handle.db, world, id)
    const result = await recordProof(
      handle.db,
      world.staff,
      {
        itemIds: mail.map((i) => i.id),
        method: 'certificate_of_mailing',
        reference: null,
        effectiveOn: d('2027-04-11'),
        documentId,
      },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'future_date' })
  })

  it('an unknown document is refused', async () => {
    const { mail } = await zbaMailItems(1)
    const result = await recordProof(
      handle.db,
      world.staff,
      {
        itemIds: mail.map((i) => i.id),
        method: 'certificate_of_mailing',
        reference: null,
        effectiveOn: d('2027-04-01'),
        documentId: randomUUID(),
      },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'document_not_found' })
  })

  it('a document from another application is refused', async () => {
    const { mail } = await zbaMailItems(1)
    const other = await pbApplication()
    const documentId = await proofDocument(handle.db, world, other)
    const result = await recordProof(
      handle.db,
      world.staff,
      {
        itemIds: mail.map((i) => i.id),
        method: 'certificate_of_mailing',
        reference: null,
        effectiveOn: d('2027-04-01'),
        documentId,
      },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'document_not_found' })
  })

  it('one certificate covers twelve items', async () => {
    const { id, mail } = await zbaMailItems(12)
    expect(mail).toHaveLength(12)
    const documentId = await proofDocument(handle.db, world, id)
    const result = await recordProof(
      handle.db,
      world.staff,
      {
        itemIds: mail.map((i) => i.id),
        method: 'certificate_of_mailing',
        reference: null,
        effectiveOn: d('2027-04-01'),
        documentId,
      },
      signal,
      NOW,
    )
    expect(result.ok && result.value.proofIds).toHaveLength(12)
    const rows = await handle.db.select().from(noticeProofs)
    expect(new Set(rows.map((r) => r.documentId)).size).toBe(1)
  })

  it('a second proof supersedes the first without updating it', async () => {
    const { id, setId, mail } = await zbaMailItems(1)
    const first = await proofDocument(handle.db, world, id)
    const second = await proofDocument(handle.db, world, id)
    const base = {
      itemIds: mail.map((i) => i.id),
      method: 'certificate_of_mailing' as const,
      reference: null,
    }
    const early = await recordProof(
      handle.db,
      world.staff,
      { ...base, effectiveOn: d('2027-04-01'), documentId: first },
      signal,
      NOW,
    )
    expect(early.ok).toBe(true)
    const later = await recordProof(
      handle.db,
      world.staff,
      { ...base, effectiveOn: d('2027-04-05'), documentId: second },
      signal,
      NOW,
    )
    expect(later.ok).toBe(true)
    expect(await handle.db.select().from(noticeProofs)).toHaveLength(2)
    expect(await handle.db.select().from(noticeProofSupersessions)).toHaveLength(1)
    const status = await noticeStatus(handle.db, setId, signal)
    expect(status.items.find((i) => i.channel === 'verified_mail')?.proof?.effectiveOn).toBe(
      '2027-04-05',
    )
    await expect(handle.db.update(noticeProofs).set({ method: 'posting' })).rejects.toThrow()
  })

  it('a reviewer recording proof is forbidden', async () => {
    const { id, mail } = await zbaMailItems(1)
    const documentId = await proofDocument(handle.db, world, id)
    const result = await recordProof(
      handle.db,
      world.reviewer,
      {
        itemIds: mail.map((i) => i.id),
        method: 'certificate_of_mailing',
        reference: null,
        effectiveOn: d('2027-04-01'),
        documentId,
      },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(await handle.db.select().from(noticeProofs)).toEqual([])
  })
})

describe('noticeStatus', () => {
  it('properly noticed is false with one missing posting', async () => {
    const { id, setId, items } = await zbaMailItems(1)
    const documentId = await proofDocument(handle.db, world, id)
    const covered = items.filter((i) => i.channel === 'verified_mail')
    await recordProof(
      handle.db,
      world.staff,
      {
        itemIds: covered.map((i) => i.id),
        method: 'certificate_of_mailing',
        reference: null,
        effectiveOn: d('2027-04-01'),
        documentId,
      },
      signal,
      NOW,
    )
    const status = await noticeStatus(handle.db, setId, signal)
    expect(status.properlyNoticed).toBe(false)
    expect(
      status.items
        .filter((i) => i.state === 'missing')
        .map((i) => i.channel)
        .sort(),
    ).toEqual(['bulletin_board', 'newspaper'])
  })

  it('properly noticed is true once every item has timely proof', async () => {
    const { id, setId, items } = await zbaMailItems(1)
    const mailDoc = await proofDocument(handle.db, world, id)
    const paperDoc = await proofDocument(handle.db, world, id)
    const run = (
      channel: string,
      method: 'certificate_of_mailing' | 'newspaper_publication' | 'posting',
      documentId: string,
    ) =>
      recordProof(
        handle.db,
        world.staff,
        {
          itemIds: items.filter((i) => i.channel === channel).map((i) => i.id),
          method,
          reference: null,
          effectiveOn: d('2027-04-01'),
          documentId,
        },
        signal,
        NOW,
      )
    await run('verified_mail', 'certificate_of_mailing', mailDoc)
    await run('newspaper', 'newspaper_publication', paperDoc)
    await run('bulletin_board', 'posting', paperDoc)
    expect((await noticeStatus(handle.db, setId, signal)).properlyNoticed).toBe(true)
  })

  it('an empty set is not properly noticed', async () => {
    expect((await noticeStatus(handle.db, randomUUID(), signal)).properlyNoticed).toBe(false)
  })
})
