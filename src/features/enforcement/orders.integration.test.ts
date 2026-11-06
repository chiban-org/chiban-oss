import {
  ORDER_CEASE_SENTENCE,
  ORDER_LIEN_WARNING,
  ORDER_MOTION_NOTICE,
} from '@packs/nh/starters/enforcementTemplates'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  auditLog,
  documents,
  documentVersions,
  enforcementCases,
  enforcementDesignations,
  enforcementOrders,
  files,
  violationNotices,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import {
  designateEnforcementOfficer,
  endEnforcementDesignation,
} from '@/features/enforcement/designations'
import { recordFinding } from '@/features/enforcement/findings'
import { recordNoticeReceipt, sendViolationNotice } from '@/features/enforcement/notices'
import {
  discardDraftOrder,
  draftOrder,
  issueOrder,
  reviseDraftOrder,
} from '@/features/enforcement/orders'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { pdfText } from '@/test/pdfText'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T15:00:00Z')
const d = (s: string) => s as CivilDate
let handle: TestDb
let store: ObjectStore
let staff: Actor
let admin: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  store = (await makeTestStore()).store
  staff = await staffActor(handle.db, 'staff')
  admin = await staffActor(handle.db, 'admin')
})
afterEach(async () => {
  await handle.drop()
})

async function caseWithFinding(kind: 'zoning_ordinance' | 'building_code' = 'zoning_ordinance') {
  const opened = await openCase(handle.db, staff, { locationText: '14 Birch Lane' }, signal, NOW)
  if (!opened.ok) throw new Error(opened.error)
  const { caseId } = opened.value
  await setCaseStatus(
    handle.db,
    staff,
    { caseId, to: 'investigating', expectedRowVersion: 1 },
    signal,
  )
  const finding = await recordFinding(
    handle.db,
    staff,
    {
      caseId,
      provisionKind: kind,
      provisionRef: kind === 'building_code' ? 'IRC R105.1' : 'Zoning Ordinance Section 4.2',
      facts: 'A garage was built without a permit.',
      inspectionDate: d('2027-02-26'),
    },
    signal,
    NOW,
  )
  if (!finding.ok) throw new Error(JSON.stringify(finding.error))
  return { caseId, findingId: finding.value.findingId }
}

async function designate(actor: Actor = staff, adoptedOn = '2027-01-05') {
  const result = await designateEnforcementOfficer(
    handle.db,
    admin,
    {
      userId: actor.userId,
      title: 'Code Enforcement Officer',
      adoptingAuthority: 'Select Board',
      adoptedOn: d(adoptedOn),
    },
    signal,
  )
  if (!result.ok) throw new Error(result.error)
}

async function draft(
  caseId: string,
  findingIds: string[],
  overrides: Partial<Parameters<typeof draftOrder>[2]> = {},
) {
  return await draftOrder(
    handle.db,
    staff,
    {
      caseId,
      findingIds,
      correctiveAction: 'Remove the garage or apply for a permit.',
      correctiveDeadline: d('2027-04-15'),
      ceaseImmediately: false,
      ...overrides,
    },
    signal,
    NOW,
  )
}

describe('findings and notices of violation', () => {
  it('recording a finding advances an investigating case to violation found', async () => {
    const { caseId } = await caseWithFinding()
    const [row] = await handle.db
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, caseId))
    expect(row?.status).toBe('violation_found')
  })

  it('a finding on a case that is only received is case_not_investigating', async () => {
    const opened = await openCase(handle.db, staff, { locationText: 'x' }, signal, NOW)
    if (!opened.ok) throw new Error('open')
    const result = await recordFinding(
      handle.db,
      staff,
      {
        caseId: opened.value.caseId,
        provisionKind: 'zoning_ordinance',
        provisionRef: 'Section 4',
        facts: 'x',
        inspectionDate: d('2027-02-26'),
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'case_not_investigating' })
  })

  it('notice receipt date is stored and audited', async () => {
    const { caseId, findingId } = await caseWithFinding()
    const sent = await sendViolationNotice(
      handle.db,
      store,
      staff,
      { caseId, findingIds: [findingId], sentOn: d('2027-03-02'), method: 'first_class_mail' },
      signal,
      NOW,
    )
    if (!sent.ok) throw new Error(JSON.stringify(sent.error))
    const received = await recordNoticeReceipt(
      handle.db,
      staff,
      { noticeId: sent.value.noticeId, receivedOn: d('2027-03-05'), basis: 'Signed mail receipt' },
      signal,
    )
    expect(received.ok).toBe(true)
    const [row] = await handle.db
      .select()
      .from(violationNotices)
      .where(eq(violationNotices.id, sent.value.noticeId))
    expect(row).toMatchObject({ receivedOn: '2027-03-05', receiptBasis: 'Signed mail receipt' })
    const audit = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, sent.value.noticeId))
    expect(audit.map((a) => a.action)).toContain('enforcement.notice_received')
  })

  it('the notice pdf names the provision and the inspection date in long form', async () => {
    const { caseId, findingId } = await caseWithFinding()
    const sent = await sendViolationNotice(
      handle.db,
      store,
      staff,
      { caseId, findingIds: [findingId], sentOn: d('2027-03-02'), method: 'in_hand' },
      signal,
      NOW,
    )
    if (!sent.ok) throw new Error(JSON.stringify(sent.error))
    const text = await documentText(sent.value.documentId)
    expect(text).toContain('Zoning Ordinance Section 4.2')
    expect(text).toContain('February 26, 2027')
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(text).not.toContain('zoning_ordinance')
  })

  it('a reviewer cannot record a finding', async () => {
    const { caseId } = await caseWithFinding()
    const reviewer = await staffActor(handle.db, 'reviewer')
    const result = await recordFinding(
      handle.db,
      reviewer,
      {
        caseId,
        provisionKind: 'zoning_ordinance',
        provisionRef: 'x',
        facts: 'x',
        inspectionDate: d('2027-02-26'),
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })
})

async function documentText(documentId: string): Promise<string> {
  const [version] = await handle.db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
  const [file] = await handle.db
    .select()
    .from(files)
    .where(eq(files.sha256, version?.fileSha256 ?? ''))
  const stream = await store.getStream(file?.storageKey ?? '', signal)
  if (!stream.ok) throw new Error('bytes')
  const text = await pdfText(new Uint8Array(await new Response(stream.value).arrayBuffer()))
  return text.replace(/\n/g, ' ')
}

describe('cease and desist orders', () => {
  it('all building code findings select nh.enf.cd_building', async () => {
    const { caseId, findingId } = await caseWithFinding('building_code')
    const drafted = await draft(caseId, [findingId])
    if (!drafted.ok) throw new Error(JSON.stringify(drafted.error))
    expect(drafted.value.ruleKey).toBe('nh.enf.cd_building')
    expect(drafted.value.number).toBe('CD-2027-0001')
  })

  it('zoning findings select nh.enf.cd_zoning', async () => {
    const { caseId, findingId } = await caseWithFinding('zoning_ordinance')
    const drafted = await draft(caseId, [findingId])
    if (!drafted.ok) throw new Error(JSON.stringify(drafted.error))
    expect(drafted.value.ruleKey).toBe('nh.enf.cd_zoning')
  })

  it('mixed building and zoning findings are split_required', async () => {
    const { caseId, findingId } = await caseWithFinding('zoning_ordinance')
    const second = await recordFinding(
      handle.db,
      staff,
      {
        caseId,
        provisionKind: 'building_code',
        provisionRef: 'IRC R105.1',
        facts: 'No permit',
        inspectionDate: d('2027-02-26'),
      },
      signal,
    )
    if (!second.ok) throw new Error('finding')
    expect(await draft(caseId, [findingId, second.value.findingId])).toEqual({
      ok: false,
      error: 'split_required',
    })
  })

  it('a split pair of zoning and building orders can both be issued on one case', async () => {
    const { caseId, findingId } = await caseWithFinding('zoning_ordinance')
    const building = await recordFinding(
      handle.db,
      staff,
      {
        caseId,
        provisionKind: 'building_code',
        provisionRef: 'IRC R105.1',
        facts: 'No permit',
        inspectionDate: d('2027-02-26'),
      },
      signal,
      NOW,
    )
    if (!building.ok) throw new Error('finding')
    await designate()
    const zoningOrder = await draft(caseId, [findingId])
    const buildingOrder = await draft(caseId, [building.value.findingId])
    if (!zoningOrder.ok || !buildingOrder.ok) throw new Error('draft')
    for (const drafted of [zoningOrder, buildingOrder]) {
      const result = await issueOrder(
        handle.db,
        store,
        staff,
        { orderId: drafted.value.orderId, issuedOn: d('2027-03-02'), expectedRowVersion: 1 },
        signal,
        NOW,
      )
      expect(result.ok).toBe(true)
    }
    const rows = await handle.db
      .select()
      .from(enforcementOrders)
      .where(eq(enforcementOrders.caseId, caseId))
    expect(rows.map((r) => r.ruleKey).sort()).toEqual(['nh.enf.cd_building', 'nh.enf.cd_zoning'])
    const [kase] = await handle.db
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, caseId))
    expect(kase?.status).toBe('order_issued')
  })

  it('issue without a designation covering the issue date is not_designated', async () => {
    const { caseId, findingId } = await caseWithFinding()
    const drafted = await draft(caseId, [findingId])
    if (!drafted.ok) throw new Error('draft')
    await designate(staff, '2027-03-10')
    const result = await issueOrder(
      handle.db,
      store,
      staff,
      { orderId: drafted.value.orderId, issuedOn: d('2027-03-02'), expectedRowVersion: 1 },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'not_designated' })
  })

  it('a draft on a case already in court is refused as past orders, not as missing a finding', async () => {
    const { caseId, findingId } = await caseWithFinding()
    await designate()
    const drafted = await draft(caseId, [findingId])
    if (!drafted.ok) throw new Error('draft')
    await handle.db
      .update(enforcementCases)
      .set({ status: 'in_court' })
      .where(eq(enforcementCases.id, caseId))
    const result = await issueOrder(
      handle.db,
      store,
      staff,
      { orderId: drafted.value.orderId, issuedOn: d('2027-03-02'), expectedRowVersion: 1 },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'case_past_orders' })
  })

  it('an officer whose designation ended before the issue date cannot issue', async () => {
    const { caseId, findingId } = await caseWithFinding()
    const drafted = await draft(caseId, [findingId])
    if (!drafted.ok) throw new Error('draft')
    await designate()
    const [designation] = await handle.db.select().from(enforcementDesignations)
    const ended = await endEnforcementDesignation(
      handle.db,
      admin,
      { designationId: designation?.id ?? '', endedOn: d('2027-02-28') },
      signal,
    )
    expect(ended.ok).toBe(true)
    const result = await issueOrder(
      handle.db,
      store,
      staff,
      { orderId: drafted.value.orderId, issuedOn: d('2027-03-02'), expectedRowVersion: 1 },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'not_designated' })
  })

  it('order missing corrective action lists correctiveAction in missingContent', async () => {
    const { caseId, findingId } = await caseWithFinding()
    await designate()
    const drafted = await draft(caseId, [findingId], { correctiveAction: '' })
    if (!drafted.ok) throw new Error('draft')
    const result = await issueOrder(
      handle.db,
      store,
      staff,
      { orderId: drafted.value.orderId, issuedOn: d('2027-03-02'), expectedRowVersion: 1 },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: { missingContent: ['correctiveAction'] } })
  })

  it('a draft missing its deadline can be given one and then issued', async () => {
    const { caseId, findingId } = await caseWithFinding()
    await designate()
    const drafted = await draft(caseId, [findingId], { correctiveDeadline: null })
    if (!drafted.ok) throw new Error('draft')
    const issue = (expectedRowVersion: number) =>
      issueOrder(
        handle.db,
        store,
        staff,
        { orderId: drafted.value.orderId, issuedOn: d('2027-03-02'), expectedRowVersion },
        signal,
        NOW,
      )
    expect(await issue(1)).toEqual({
      ok: false,
      error: { missingContent: ['correctiveDeadline'] },
    })
    const revised = await reviseDraftOrder(
      handle.db,
      staff,
      {
        orderId: drafted.value.orderId,
        expectedRowVersion: 1,
        correctiveAction: 'Remove the garage or apply for a permit.',
        correctiveDeadline: d('2027-04-15'),
        ceaseImmediately: false,
      },
      signal,
    )
    expect(revised.ok).toBe(true)
    expect((await issue(2)).ok).toBe(true)
  })

  it('a discarded draft is withdrawn and can no longer be issued or changed', async () => {
    const { caseId, findingId } = await caseWithFinding()
    await designate()
    const drafted = await draft(caseId, [findingId], { correctiveDeadline: null })
    if (!drafted.ok) throw new Error('draft')
    const input = { orderId: drafted.value.orderId, expectedRowVersion: 1 }
    expect((await discardDraftOrder(handle.db, staff, input, signal)).ok).toBe(true)
    const [row] = await handle.db
      .select()
      .from(enforcementOrders)
      .where(eq(enforcementOrders.id, drafted.value.orderId))
    expect(row?.status).toBe('withdrawn')
    expect(
      await discardDraftOrder(handle.db, staff, { ...input, expectedRowVersion: 2 }, signal),
    ).toEqual({
      ok: false,
      error: 'not_a_draft',
    })
  })

  it('a deadline before the issue date is deadline_before_issue', async () => {
    const { caseId, findingId } = await caseWithFinding()
    await designate()
    const drafted = await draft(caseId, [findingId], { correctiveDeadline: d('2027-03-01') })
    if (!drafted.ok) throw new Error('draft')
    const result = await issueOrder(
      handle.db,
      store,
      staff,
      { orderId: drafted.value.orderId, issuedOn: d('2027-03-02'), expectedRowVersion: 1 },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'deadline_before_issue' })
  })

  it('finance without enforcement.issue_order is forbidden', async () => {
    const { caseId, findingId } = await caseWithFinding()
    const drafted = await draft(caseId, [findingId])
    if (!drafted.ok) throw new Error('draft')
    const finance = await staffActor(handle.db, 'finance')
    const result = await issueOrder(
      handle.db,
      store,
      finance,
      { orderId: drafted.value.orderId, issuedOn: d('2027-03-02'), expectedRowVersion: 1 },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })

  it('issued order pdf text contains the motion notice and the inspection date', async () => {
    const { caseId, findingId } = await caseWithFinding()
    await designate()
    const drafted = await draft(caseId, [findingId], { ceaseImmediately: true })
    if (!drafted.ok) throw new Error('draft')
    const result = await issueOrder(
      handle.db,
      store,
      staff,
      { orderId: drafted.value.orderId, issuedOn: d('2027-03-02'), expectedRowVersion: 1 },
      signal,
      NOW,
    )
    if (!result.ok) throw new Error(JSON.stringify(result.error))
    const text = await documentText(result.value.documentId)
    expect(text).toContain('CD-2027-0001')
    expect(text).toContain('February 26, 2027')
    expect(text).toContain(ORDER_MOTION_NOTICE)
    expect(text).toContain(
      'Unless the corrective action is taken within the time this order provides',
    )
    expect(ORDER_LIEN_WARNING).toContain(
      'If you do not take the corrective action or file an answer',
    )
    expect(text).toContain(ORDER_LIEN_WARNING)
    expect(text).toContain(ORDER_CEASE_SENTENCE)
    expect(text).toContain('April 15, 2027')
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    const [doc] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.id, result.value.documentId))
    expect(doc).toMatchObject({ docKind: 'enforcement_letter', isPublic: false })
    const [order] = await handle.db
      .select()
      .from(enforcementOrders)
      .where(eq(enforcementOrders.id, drafted.value.orderId))
    expect(order).toMatchObject({
      status: 'issued',
      issuedOn: '2027-03-02',
      issuedBy: staff.userId,
    })
    const [row] = await handle.db
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, caseId))
    expect(row?.status).toBe('order_issued')
  })

  it('a stale row version is stale_version', async () => {
    const { caseId, findingId } = await caseWithFinding()
    await designate()
    const drafted = await draft(caseId, [findingId])
    if (!drafted.ok) throw new Error('draft')
    const result = await issueOrder(
      handle.db,
      store,
      staff,
      { orderId: drafted.value.orderId, issuedOn: d('2027-03-02'), expectedRowVersion: 5 },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'stale_version' })
  })

  it('an order cannot be issued twice', async () => {
    const { caseId, findingId } = await caseWithFinding()
    await designate()
    const drafted = await draft(caseId, [findingId])
    if (!drafted.ok) throw new Error('draft')
    const input = {
      orderId: drafted.value.orderId,
      issuedOn: d('2027-03-02'),
      expectedRowVersion: 1,
    }
    expect((await issueOrder(handle.db, store, staff, input, signal, NOW)).ok).toBe(true)
    expect(
      await issueOrder(handle.db, store, staff, { ...input, expectedRowVersion: 2 }, signal, NOW),
    ).toEqual({
      ok: false,
      error: 'not_a_draft',
    })
  })

  it('only an admin with config.edit can designate an officer', async () => {
    const result = await designateEnforcementOfficer(
      handle.db,
      staff,
      {
        userId: staff.userId,
        title: 'Officer',
        adoptingAuthority: 'Select Board',
        adoptedOn: d('2027-01-05'),
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })
})
