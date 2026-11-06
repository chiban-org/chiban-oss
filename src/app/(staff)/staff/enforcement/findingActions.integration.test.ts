import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { enforcementNotes, violationFindings, violationNotices } from '@/db/schema'
import { sendViolationNotice } from '@/features/enforcement/notices'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage, textMessage } from '@/test/boardCases'
import { lazy } from '@/test/boardPanelFixtures'
import { caseWithFinding, intakeCase, investigatingCase } from '@/test/enforcementActionFixtures'
import { PAST_ONLY, pastDateMessage, useEnforcementClock } from '@/test/enforcementCases'
import {
  type EnforcementWorld,
  FIXTURE_NOW,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  type InvalidVariant,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./findingActions')

const h = actionHarness()
h.useObjectStore()
useEnforcementClock()
const signal = new AbortController().signal
let world: EnforcementWorld

beforeAll(async () => {
  world = await setupEnforcementWorld(h.db)
})

const forNote = lazy(() => investigatingCase(h.db, world, '21 Birch Lane'))

function noteRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'caseId':
      return refuseField('caseId', idMessage('a case'))
    case 'observedOn':
      return refuseField('observedOn', pastDateMessage('the date observed', variant))
    default:
      return refuseField('body', textMessage('a note', 5000, variant))
  }
}

describeActionCases(h, 'addNoteAction', {
  invoke: actions.addNoteAction,
  actor: () => world.staff,
  input: async () => ({
    caseId: (await forNote()).caseId,
    observedOn: '2027-07-01',
    body: 'Silt fence is down along the brook.',
  }),
  fields: {
    caseId: uuid({ required: true }),
    observedOn: date({ required: true, ...PAST_ONLY }),
    body: text({ required: true, max: 5000 }),
  },
  capability: 'enforcement.manage',
  refusals: { ...STAFF_REFUSALS, invalid: noteRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Note added.' })
    const rows = await db
      .select({ observedOn: enforcementNotes.observedOn, body: enforcementNotes.body })
      .from(enforcementNotes)
      .where(eq(enforcementNotes.caseId, (await forNote()).caseId))
    expect(rows).toEqual([
      { observedOn: '2027-07-01', body: 'Silt fence is down along the brook.' },
    ])
  },
})

describe('addNoteAction sweep findings', () => {
  it('refuses an observed date of 2099-01-01 beside the date field and adds no note (C-09)', async () => {
    h.signIn(world.staff)
    const { caseId } = await forNote()
    const { value, written } = await h.recordWrites(() =>
      actions.addNoteAction(
        h.form({ caseId, observedOn: '2099-01-01', body: 'Seen from the road.' }),
      ),
    )
    expect({ value, written }).toEqual({
      value: refuseField(
        'observedOn',
        'Enter the date observed between January 1, 1900 and July 20, 2027.',
      ),
      written: [],
    })
  })

  it('accepts a note observed today', async () => {
    h.signIn(world.staff)
    const { caseId } = await forNote()
    const result = await actions.addNoteAction(
      h.form({ caseId, observedOn: '2027-07-20', body: 'Seen this morning.' }),
    )
    expect(result).toEqual({ ok: true, message: 'Note added.' })
  })

  it('names the note field for a note of spaces and one over 5000 characters (C-07)', async () => {
    h.signIn(world.staff)
    const { caseId } = await forNote()
    const note = (body: string) => h.form({ caseId, observedOn: '2027-07-01', body })
    expect(await actions.addNoteAction(note('   '))).toEqual(refuseField('body', 'Enter a note.'))
    expect(await actions.addNoteAction(note('x'.repeat(5001)))).toEqual(
      refuseField('body', 'Enter a note of 5000 characters or fewer.'),
    )
  })
})

const forFinding = lazy(() => investigatingCase(h.db, world, '22 Birch Lane'))

function findingRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'caseId':
      return refuseField('caseId', idMessage('a case'))
    case 'provisionKind':
      return refuseField('provisionKind', 'Choose what was violated.')
    case 'provisionRef':
      return refuseField('provisionRef', textMessage('the section or condition', 300, variant))
    case 'facts':
      return refuseField('facts', textMessage('the facts', 5000, variant))
    default:
      return refuseField('inspectionDate', pastDateMessage('the inspection date', variant))
  }
}

describeActionCases(h, 'recordFindingAction', {
  invoke: actions.recordFindingAction,
  actor: () => world.staff,
  input: async () => ({
    caseId: (await forFinding()).caseId,
    provisionKind: 'zoning_ordinance',
    provisionRef: 'Zoning Ordinance Section 4.2',
    facts: 'A shed stands in the side setback.',
    inspectionDate: '2027-07-02',
  }),
  fields: {
    caseId: uuid({ required: true }),
    provisionKind: choice({ required: true }),
    provisionRef: text({ required: true, max: 300 }),
    facts: text({ required: true, max: 5000 }),
    inspectionDate: date({ required: true, ...PAST_ONLY }),
  },
  capability: 'enforcement.manage',
  refusals: { ...STAFF_REFUSALS, invalid: findingRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Finding recorded.' })
    const rows = await db
      .select({ ref: violationFindings.provisionRef, inspected: violationFindings.inspectionDate })
      .from(violationFindings)
      .where(eq(violationFindings.caseId, (await forFinding()).caseId))
    expect(rows).toEqual([{ ref: 'Zoning Ordinance Section 4.2', inspected: '2027-07-02' }])
  },
})

describe('recordFindingAction sweep findings', () => {
  it('names the section field for spaces, 301 characters, and the facts for 5001 (C-07)', async () => {
    h.signIn(world.staff)
    const { caseId } = await forFinding()
    const finding = (fields: Record<string, string>) =>
      h.form({
        caseId,
        provisionKind: 'zoning_ordinance',
        provisionRef: 'Section 4.2',
        facts: 'A shed.',
        inspectionDate: '2027-07-02',
        ...fields,
      })
    expect(await actions.recordFindingAction(finding({ provisionRef: '  ' }))).toEqual(
      refuseField('provisionRef', 'Enter the section or condition.'),
    )
    expect(await actions.recordFindingAction(finding({ provisionRef: 'x'.repeat(301) }))).toEqual(
      refuseField('provisionRef', 'Enter the section or condition of 300 characters or fewer.'),
    )
    expect(await actions.recordFindingAction(finding({ facts: 'x'.repeat(5002) }))).toEqual(
      refuseField('facts', 'Enter the facts of 5000 characters or fewer.'),
    )
  })

  it('refuses a case still at intake in words and records nothing', async () => {
    h.signIn(world.staff)
    const { caseId } = await intakeCase(h.db, world, '23 Birch Lane')
    const { value, written } = await h.recordWrites(() =>
      actions.recordFindingAction(
        h.form({
          caseId,
          provisionKind: 'zoning_ordinance',
          provisionRef: 'Section 4.2',
          facts: 'A shed.',
          inspectionDate: '2027-07-02',
        }),
      ),
    )
    expect({ value, written }).toEqual({
      value: {
        ok: false,
        error: 'The case has to be under investigation before findings can be recorded.',
      },
      written: [],
    })
  })
})

const forNotice = lazy(() => caseWithFinding(h.db, world, '24 Birch Lane'))

function noticeRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'caseId':
      return refuseField('caseId', idMessage('a case'))
    case 'findingIds':
      return refuseField('findingIds', 'Choose at least one finding.')
    case 'sentOn':
      return refuseField('sentOn', pastDateMessage('the date sent', variant))
    default:
      return refuseField('method', 'Choose how it was sent.')
  }
}

describeActionCases(h, 'sendNoticeAction', {
  invoke: actions.sendNoticeAction,
  actor: () => world.staff,
  input: async () => {
    const { caseId, findingId } = await forNotice()
    return { caseId, findingIds: [findingId], sentOn: '2027-07-03', method: 'first_class_mail' }
  },
  fields: {
    caseId: uuid({ required: true }),
    findingIds: uuid({ required: true }),
    sentOn: date({ required: true, ...PAST_ONLY }),
    method: choice({ required: true }),
  },
  capability: 'enforcement.manage',
  refusals: { ...STAFF_REFUSALS, invalid: noticeRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Notice of violation recorded.' })
    const rows = await db
      .select({ sentOn: violationNotices.sentOn, method: violationNotices.method })
      .from(violationNotices)
      .where(eq(violationNotices.caseId, (await forNotice()).caseId))
    expect(rows).toEqual([{ sentOn: '2027-07-03', method: 'first_class_mail' }])
  },
})

describe('sendNoticeAction with findings from another case', () => {
  it('refuses beside the findings and records nothing', async () => {
    h.signIn(world.staff)
    const mine = await caseWithFinding(h.db, world, '25 Birch Lane')
    const other = await caseWithFinding(h.db, world, '26 Birch Lane')
    const { value, written } = await h.recordWrites(() =>
      actions.sendNoticeAction(
        h.form({
          caseId: mine.caseId,
          findingIds: [other.findingId],
          sentOn: '2027-07-03',
          method: 'in_hand',
        }),
      ),
    )
    expect({ value, written }).toEqual({
      value: refuseField('findingIds', 'Choose open findings that belong to this case.'),
      written: [],
    })
  })

  it('refuses a notice sent on 2099-01-01 beside the date', async () => {
    h.signIn(world.staff)
    const { caseId, findingId } = await caseWithFinding(h.db, world, '27 Birch Lane')
    const result = await actions.sendNoticeAction(
      h.form({ caseId, findingIds: [findingId], sentOn: '2099-01-01', method: 'in_hand' }),
    )
    expect(result).toEqual(
      refuseField('sentOn', 'Enter the date sent between January 1, 1900 and July 20, 2027.'),
    )
  })
})

const forReceipt = lazy(async () => {
  const { caseId, findingId } = await caseWithFinding(h.db, world, '28 Birch Lane')
  const sent = await sendViolationNotice(
    h.db,
    h.store,
    world.staff,
    { caseId, findingIds: [findingId], sentOn: '2027-07-03', method: 'certified_mail' },
    signal,
    FIXTURE_NOW,
  )
  if (!sent.ok) throw new Error(String(sent.error))
  return sent.value.noticeId
})

function receiptRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'noticeId':
      return refuseField('noticeId', idMessage('a notice'))
    case 'receivedOn':
      return refuseField('receivedOn', pastDateMessage('the date received', variant))
    default:
      return refuseField('basis', textMessage('how receipt is known', 500, variant))
  }
}

describeActionCases(h, 'recordNoticeReceiptAction', {
  invoke: actions.recordNoticeReceiptAction,
  actor: () => world.staff,
  input: async () => ({
    noticeId: await forReceipt(),
    receivedOn: '2027-07-08',
    basis: 'Green card signed by the owner',
  }),
  fields: {
    noticeId: uuid({ required: true }),
    receivedOn: date({ required: true, ...PAST_ONLY }),
    basis: text({ required: true, max: 500 }),
  },
  capability: 'enforcement.manage',
  refusals: { ...STAFF_REFUSALS, invalid: receiptRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Receipt recorded.' })
    const [row] = await db
      .select({ receivedOn: violationNotices.receivedOn, basis: violationNotices.receiptBasis })
      .from(violationNotices)
      .where(eq(violationNotices.id, await forReceipt()))
    expect(row).toEqual({ receivedOn: '2027-07-08', basis: 'Green card signed by the owner' })
  },
})
