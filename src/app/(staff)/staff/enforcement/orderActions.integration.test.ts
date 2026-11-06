import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { enforcementOrders } from '@/db/schema'
import { recordFinding } from '@/features/enforcement/findings'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { dateMessage, idMessage, textMessage } from '@/test/boardCases'
import { lazy } from '@/test/boardPanelFixtures'
import { caseWithFinding, designateStaff } from '@/test/enforcementActionFixtures'
import {
  FULL_RANGE,
  PAST_ONLY,
  pastDateMessage,
  useEnforcementClock,
  wholeNumberMessage,
} from '@/test/enforcementCases'
import {
  type EnforcementWorld,
  FIXTURE_NOW,
  issuedOrder,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import {
  actionHarness,
  date,
  describeActionCases,
  type InvalidVariant,
  int,
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

const actions = await import('./orderActions')

const h = actionHarness()
h.useObjectStore()
useEnforcementClock()
const signal = new AbortController().signal
const VERSION = { min: 1, max: 2_147_483_647 }
let world: EnforcementWorld

beforeAll(async () => {
  world = await setupEnforcementWorld(h.db)
})

const designated = lazy(() => designateStaff(h.db, world))
const draftAt = (location: string) =>
  issuedOrder(h.db, h.store, world, { skipDesignation: true, location })

const orderOf = (id: string) =>
  h.db
    .select()
    .from(enforcementOrders)
    .where(eq(enforcementOrders.id, id))
    .then((rows) => rows[0])

const forDraft = lazy(() => caseWithFinding(h.db, world, '31 Cedar Lane'))

function draftRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'caseId':
      return refuseField('caseId', idMessage('a case'))
    case 'findingIds':
      return refuseField('findingIds', 'Choose at least one finding.')
    case 'correctiveAction':
      return refuseField('correctiveAction', textMessage('the corrective action', 5000, variant))
    default:
      return refuseField(
        'correctiveDeadline',
        dateMessage('the corrective action deadline', variant),
      )
  }
}

describeActionCases(h, 'draftOrderAction', {
  invoke: actions.draftOrderAction,
  actor: () => world.staff,
  input: async () => {
    const { caseId, findingId } = await forDraft()
    return {
      caseId,
      findingIds: [findingId],
      correctiveAction: 'Remove the shed or apply for a permit.',
      correctiveDeadline: '2027-09-01',
      ceaseImmediately: 'on',
    }
  },
  fields: {
    caseId: uuid({ required: true }),
    findingIds: uuid({ required: true }),
    correctiveAction: text({ max: 5000 }),
    correctiveDeadline: date(FULL_RANGE),
  },
  capability: 'enforcement.manage',
  refusals: { ...STAFF_REFUSALS, invalid: draftRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Order drafted.' })
    const rows = await db
      .select({
        status: enforcementOrders.status,
        action: enforcementOrders.correctiveAction,
        deadline: enforcementOrders.correctiveDeadline,
        cease: enforcementOrders.ceaseImmediately,
      })
      .from(enforcementOrders)
      .where(eq(enforcementOrders.caseId, (await forDraft()).caseId))
    expect(rows).toEqual([
      {
        status: 'draft',
        action: 'Remove the shed or apply for a permit.',
        deadline: '2027-09-01',
        cease: true,
      },
    ])
  },
})

describe('draftOrderAction findings the feature owns', () => {
  it('refuses findings that mix building code and zoning beside the findings', async () => {
    h.signIn(world.staff)
    const { caseId, findingId } = await caseWithFinding(h.db, world, '32 Cedar Lane')
    const building = await recordFinding(
      h.db,
      world.staff,
      {
        caseId,
        provisionKind: 'building_code',
        provisionRef: 'IBC 105.1',
        facts: 'Framing without a permit.',
        inspectionDate: '2027-02-21',
      },
      signal,
      FIXTURE_NOW,
    )
    if (!building.ok) throw new Error(building.error)
    const { value, written } = await h.recordWrites(() =>
      actions.draftOrderAction(
        h.form({
          caseId,
          findingIds: [findingId, building.value.findingId],
          correctiveAction: 'Stop work.',
        }),
      ),
    )
    expect({ value, written }).toEqual({
      value: refuseField(
        'findingIds',
        'These findings mix building code and other violations. Issue a separate order for each kind.',
      ),
      written: [],
    })
  })

  it('refuses a finding from another case beside the findings', async () => {
    h.signIn(world.staff)
    const mine = await caseWithFinding(h.db, world, '33 Cedar Lane')
    const other = await caseWithFinding(h.db, world, '34 Cedar Lane')
    const result = await actions.draftOrderAction(
      h.form({ caseId: mine.caseId, findingIds: [other.findingId], correctiveAction: 'Stop.' }),
    )
    expect(result).toEqual(
      refuseField('findingIds', 'Choose open findings that belong to this case.'),
    )
  })

  it('saves a draft with no corrective action and no deadline', async () => {
    h.signIn(world.staff)
    const { caseId, findingId } = await caseWithFinding(h.db, world, '35 Cedar Lane')
    const result = await actions.draftOrderAction(
      h.form({ caseId, findingIds: [findingId], correctiveAction: '', correctiveDeadline: '' }),
    )
    expect(result).toEqual({ ok: true, message: 'Order drafted.' })
  })
})

const forRevise = lazy(() => draftAt('36 Cedar Lane'))

function reviseRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'orderId':
      return refuseField('orderId', idMessage('an order'))
    case 'expectedRowVersion':
      return refuseField(
        'expectedRowVersion',
        wholeNumberMessage('the version of this record', VERSION, variant),
      )
    case 'correctiveAction':
      return refuseField('correctiveAction', textMessage('the corrective action', 5000, variant))
    default:
      return refuseField(
        'correctiveDeadline',
        dateMessage('the corrective action deadline', variant),
      )
  }
}

describeActionCases(h, 'reviseDraftOrderAction', {
  invoke: actions.reviseDraftOrderAction,
  actor: () => world.staff,
  input: async () => ({
    orderId: (await forRevise()).orderId,
    expectedRowVersion: '1',
    correctiveAction: 'Move the shed back ten feet.',
    correctiveDeadline: '2027-10-01',
    ceaseImmediately: 'on',
  }),
  fields: {
    orderId: uuid({ required: true }),
    expectedRowVersion: int({ required: true, ...VERSION }),
    correctiveAction: text({ max: 5000 }),
    correctiveDeadline: date(FULL_RANGE),
  },
  capability: 'enforcement.manage',
  refusals: { ...STAFF_REFUSALS, invalid: reviseRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result) => {
    expect(result).toEqual({ ok: true, message: 'Draft saved.' })
    expect(await orderOf((await forRevise()).orderId)).toMatchObject({
      correctiveAction: 'Move the shed back ten feet.',
      correctiveDeadline: '2027-10-01',
      ceaseImmediately: true,
      rowVersion: 2,
    })
  },
})

describe('reviseDraftOrderAction on a stale version', () => {
  it('says the record changed and saves nothing', async () => {
    h.signIn(world.staff)
    const { orderId } = await draftAt('37 Cedar Lane')
    const { value, written } = await h.recordWrites(() =>
      actions.reviseDraftOrderAction(
        h.form({ orderId, expectedRowVersion: '9', correctiveAction: 'Changed.' }),
      ),
    )
    expect({ value, written }).toEqual({
      value: {
        ok: false,
        error: 'This record changed since you opened it. Reload the page and try again.',
      },
      written: [],
    })
  })
})

const forDiscard = lazy(() => draftAt('38 Cedar Lane'))

describeActionCases(h, 'discardDraftOrderAction', {
  invoke: actions.discardDraftOrderAction,
  actor: () => world.staff,
  input: async () => ({ orderId: (await forDiscard()).orderId, expectedRowVersion: '1' }),
  fields: {
    orderId: uuid({ required: true }),
    expectedRowVersion: int({ required: true, ...VERSION }),
  },
  capability: 'enforcement.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: (variant) =>
      variant.field === 'orderId'
        ? refuseField('orderId', idMessage('an order'))
        : refuseField(
            'expectedRowVersion',
            wholeNumberMessage('the version of this record', VERSION, variant),
          ),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result) => {
    expect(result).toEqual({ ok: true, message: 'Draft discarded.' })
    expect((await orderOf((await forDiscard()).orderId))?.status).toBe('withdrawn')
  },
})

const forIssue = lazy(async () => {
  await designated()
  return await draftAt('39 Cedar Lane')
})

function issueRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'orderId':
      return refuseField('orderId', idMessage('an order'))
    case 'expectedRowVersion':
      return refuseField(
        'expectedRowVersion',
        wholeNumberMessage('the version of this record', VERSION, variant),
      )
    default:
      return refuseField('issuedOn', pastDateMessage('the issue date', variant))
  }
}

describeActionCases(h, 'issueOrderAction', {
  invoke: actions.issueOrderAction,
  actor: () => world.staff,
  input: async () => ({
    orderId: (await forIssue()).orderId,
    expectedRowVersion: '1',
    issuedOn: '2027-03-02',
  }),
  fields: {
    orderId: uuid({ required: true }),
    expectedRowVersion: int({ required: true, ...VERSION }),
    issuedOn: date({ required: true, ...PAST_ONLY }),
  },
  capability: 'enforcement.issue_order',
  refusals: { ...STAFF_REFUSALS, invalid: issueRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Order issued.' })
    expect(await orderOf((await forIssue()).orderId)).toMatchObject({
      status: 'issued',
      issuedOn: '2027-03-02',
      issuedBy: world.staff.userId,
    })
    expect(written).toContain('documents')
  },
})

describe('issueOrderAction findings the feature owns', () => {
  it('refuses an issue date of 2099-01-01 beside the date and issues nothing', async () => {
    h.signIn(world.staff)
    const { orderId } = await draftAt('40 Cedar Lane')
    const { value, written } = await h.recordWrites(() =>
      actions.issueOrderAction(
        h.form({ orderId, expectedRowVersion: '1', issuedOn: '2099-01-01' }),
      ),
    )
    expect({ value, written }).toEqual({
      value: refuseField(
        'issuedOn',
        'Enter the issue date between January 1, 1900 and July 20, 2027.',
      ),
      written: [],
    })
  })

  it('refuses an officer who is not on record as designated beside the date', async () => {
    await designated()
    h.signIn(await h.actorFor('inspector'))
    const { orderId } = await draftAt('41 Cedar Lane')
    const result = await actions.issueOrderAction(
      h.form({ orderId, expectedRowVersion: '1', issuedOn: '2027-03-02' }),
    )
    expect(result).toEqual(
      refuseField(
        'issuedOn',
        'You are not on record as a designated enforcement officer on the issue date. An administrator can add it under Admin, Enforcement officers.',
      ),
    )
  })

  it('refuses an issue date after the corrective deadline beside the date', async () => {
    await designated()
    h.signIn(world.staff)
    const { orderId } = await draftAt('42 Cedar Lane')
    const result = await actions.issueOrderAction(
      h.form({ orderId, expectedRowVersion: '1', issuedOn: '2027-07-10' }),
    )
    expect(result).toEqual(
      refuseField('issuedOn', 'The corrective action deadline is before the issue date.'),
    )
  })

  it('names what the order is missing in words', async () => {
    await designated()
    h.signIn(world.staff)
    const { caseId, findingId } = await caseWithFinding(h.db, world, '43 Cedar Lane')
    h.signIn(world.staff)
    const drafted = await actions.draftOrderAction(
      h.form({ caseId, findingIds: [findingId], correctiveAction: '', correctiveDeadline: '' }),
    )
    expect(drafted.ok).toBe(true)
    const [order] = await h.db
      .select({ id: enforcementOrders.id })
      .from(enforcementOrders)
      .where(eq(enforcementOrders.caseId, caseId))
    const result = await actions.issueOrderAction(
      h.form({ orderId: order?.id ?? '', expectedRowVersion: '1', issuedOn: '2027-03-02' }),
    )
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/^The order is missing: /),
    })
    expect(JSON.stringify(result)).not.toMatch(/[a-z]+_[a-z_]+/)
  })
})
