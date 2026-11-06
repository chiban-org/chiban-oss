import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { enforcementAppeals, perilCertifications, restrainingOrders } from '@/db/schema'
import { recordEnforcementAppeal, recordRestrainingOrder } from '@/features/enforcement/appeals'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { dateMessage, idMessage, textMessage } from '@/test/boardCases'
import { lazy } from '@/test/boardPanelFixtures'
import {
  ENFORCEMENT_NOW,
  FULL_RANGE,
  PAST_ONLY,
  pastDateMessage,
  useEnforcementClock,
} from '@/test/enforcementCases'
import {
  type EnforcementWorld,
  type IssuedOrder,
  issuedOrder,
  setupEnforcementWorld,
  uploadProof,
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
import { COURT_DOCUMENT_MESSAGE } from './serviceInputs'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./appealActions')

const h = actionHarness()
h.useObjectStore()
useEnforcementClock()
const signal = new AbortController().signal
let world: EnforcementWorld

beforeAll(async () => {
  world = await setupEnforcementWorld(h.db)
})

const appealRow = (id: string) =>
  h.db
    .select()
    .from(enforcementAppeals)
    .where(eq(enforcementAppeals.id, id))
    .then((rows) => rows[0])

async function appealOnNewOrder(location: string) {
  const order = await issuedOrder(h.db, h.store, world, { location })
  const filed = await recordEnforcementAppeal(
    h.db,
    world.staff,
    {
      caseId: order.caseId,
      targetKind: 'order',
      targetId: order.orderId,
      filedOn: '2027-03-05',
      appellantName: 'Pat Owner',
    },
    signal,
    ENFORCEMENT_NOW,
  )
  if (!filed.ok) throw new Error(filed.error)
  return { order, appealId: filed.value.appealId }
}

const forAppeal = lazy<IssuedOrder>(() =>
  issuedOrder(h.db, h.store, world, { location: '81 Willow Court' }),
)

function appealRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'caseId':
      return refuseField('caseId', idMessage('a case'))
    case 'target':
      return refuseField('target', 'Choose what is appealed.')
    case 'appellantName':
      return refuseField('appellantName', textMessage('the appellant', 200, variant))
    default:
      return refuseField('filedOn', dateMessage('the date filed', variant))
  }
}

describeActionCases(h, 'appealAction', {
  invoke: actions.appealAction,
  actor: () => world.staff,
  input: async () => {
    const order = await forAppeal()
    return {
      caseId: order.caseId,
      target: `order:${order.orderId}`,
      appellantName: 'Pat Owner',
      filedOn: '2027-03-05',
    }
  },
  fields: {
    caseId: uuid({ required: true }),
    target: choice({ required: true }),
    appellantName: text({ required: true, max: 200 }),
    filedOn: date({ required: true, ...FULL_RANGE }),
  },
  capability: 'enforcement.record_service',
  refusals: { ...STAFF_REFUSALS, invalid: appealRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    const order = await forAppeal()
    expect(result).toEqual({ ok: true, message: 'Appeal recorded.' })
    const rows = await db
      .select({ targetId: enforcementAppeals.targetId, filedOn: enforcementAppeals.filedOn })
      .from(enforcementAppeals)
      .where(eq(enforcementAppeals.caseId, order.caseId))
    expect(rows).toEqual([{ targetId: order.orderId, filedOn: '2027-03-05' }])
  },
})

describe('appealAction refusals the feature owns', () => {
  it('refuses a filing date in the future beside the date', async () => {
    h.signIn(world.staff)
    const order = await forAppeal()
    const { value, written } = await h.recordWrites(() =>
      actions.appealAction(
        h.form({
          caseId: order.caseId,
          target: `order:${order.orderId}`,
          appellantName: 'Pat Owner',
          filedOn: '2099-01-01',
        }),
      ),
    )
    expect({ value, written }).toEqual({
      value: refuseField('filedOn', 'The date cannot be in the future.'),
      written: [],
    })
  })

  it('refuses an order from another case beside what is appealed', async () => {
    h.signIn(world.staff)
    const mine = await forAppeal()
    const other = await issuedOrder(h.db, h.store, world, { location: '82 Willow Court' })
    const result = await actions.appealAction(
      h.form({
        caseId: mine.caseId,
        target: `order:${other.orderId}`,
        appellantName: 'Pat Owner',
        filedOn: '2027-03-05',
      }),
    )
    expect(result).toEqual(
      refuseField('target', 'That order or notice does not belong to this case.'),
    )
  })
})

const forResolve = lazy(() => appealOnNewOrder('83 Willow Court'))

function resolveRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'appealId':
      return refuseField('appealId', idMessage('an appeal'))
    case 'outcome':
      return refuseField('outcome', 'Choose a decision.')
    default:
      return refuseField('resolvedOn', dateMessage('the date decided', variant))
  }
}

describeActionCases(h, 'resolveAppealAction', {
  invoke: actions.resolveAppealAction,
  actor: () => world.staff,
  input: async () => ({
    appealId: (await forResolve()).appealId,
    outcome: 'upheld',
    resolvedOn: '2027-03-20',
  }),
  fields: {
    appealId: uuid({ required: true }),
    outcome: choice({ required: true }),
    resolvedOn: date({ required: true, ...FULL_RANGE }),
  },
  capability: 'enforcement.record_service',
  refusals: { ...STAFF_REFUSALS, invalid: resolveRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result) => {
    expect(result).toEqual({ ok: true, message: 'Appeal resolved.' })
    expect(await appealRow((await forResolve()).appealId)).toMatchObject({
      outcome: 'upheld',
      resolvedOn: '2027-03-20',
    })
  },
})

describe('resolveAppealAction refusals the feature owns', () => {
  it('refuses a decision dated before the appeal was filed beside the date', async () => {
    h.signIn(world.staff)
    const { appealId } = await appealOnNewOrder('84 Willow Court')
    const { value, written } = await h.recordWrites(() =>
      actions.resolveAppealAction(
        h.form({ appealId, outcome: 'upheld', resolvedOn: '2027-03-01' }),
      ),
    )
    expect({ value, written }).toEqual({
      value: refuseField('resolvedOn', 'The decision cannot be dated before the appeal was filed.'),
      written: [],
    })
  })

  it('refuses a decision dated in the future beside the date', async () => {
    h.signIn(world.staff)
    const { appealId } = await appealOnNewOrder('85 Willow Court')
    const result = await actions.resolveAppealAction(
      h.form({ appealId, outcome: 'upheld', resolvedOn: '2099-01-01' }),
    )
    expect(result).toEqual(refuseField('resolvedOn', 'The date cannot be in the future.'))
  })
})

const forPeril = lazy(() => appealOnNewOrder('86 Willow Court'))

function perilRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'appealId':
      return refuseField('appealId', idMessage('an appeal'))
    case 'category':
      return refuseField('category', 'Choose what is at risk.')
    case 'statement':
      return refuseField('statement', textMessage('a statement', 3000, variant))
    default:
      return refuseField('certifiedOn', pastDateMessage('the date certified', variant))
  }
}

describeActionCases(h, 'certifyPerilAction', {
  invoke: actions.certifyPerilAction,
  actor: () => world.staff,
  input: async () => ({
    appealId: (await forPeril()).appealId,
    category: 'safety',
    statement: 'The retaining wall is leaning over the road.',
    certifiedOn: '2027-03-06',
  }),
  fields: {
    appealId: uuid({ required: true }),
    category: choice({ required: true }),
    statement: text({ required: true, max: 3000 }),
    certifiedOn: date({ required: true, ...PAST_ONLY }),
  },
  capability: 'enforcement.issue_order',
  refusals: { ...STAFF_REFUSALS, invalid: perilRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Imminent peril certified.' })
    const rows = await db
      .select({ certifiedOn: perilCertifications.certifiedOn })
      .from(perilCertifications)
      .where(eq(perilCertifications.appealId, (await forPeril()).appealId))
    expect(rows).toEqual([{ certifiedOn: '2027-03-06' }])
  },
})

describe('certifyPerilAction by an officer who did not issue the order', () => {
  it('says only the issuing officer can certify and records nothing', async () => {
    h.signIn(await h.actorFor('inspector'))
    const { appealId } = await appealOnNewOrder('87 Willow Court')
    const { value, written } = await h.recordWrites(() =>
      actions.certifyPerilAction(
        h.form({
          appealId,
          category: 'safety',
          statement: 'The wall is leaning.',
          certifiedOn: '2027-03-06',
        }),
      ),
    )
    expect({ value, written }).toEqual({
      value: {
        ok: false,
        error:
          'Only the officer who issued the order or sent the notice can certify imminent peril.',
      },
      written: [],
    })
  })
})

const forRestraint = lazy(async () => {
  const appeal = await appealOnNewOrder('88 Willow Court')
  const documentId = await uploadProof(
    h.db,
    h.store,
    world.staff,
    appeal.order.caseId,
    'Court filing',
    'court_document',
  )
  return { ...appeal, documentId }
})

function restraintRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'appealId':
      return refuseField('appealId', idMessage('an appeal'))
    case 'issuedBy':
      return refuseField('issuedBy', 'Choose who issued it.')
    case 'issuedOn':
      return refuseField('issuedOn', pastDateMessage('the date issued', variant))
    default:
      return refuseField('documentId', COURT_DOCUMENT_MESSAGE)
  }
}

describeActionCases(h, 'restrainingOrderAction', {
  invoke: actions.restrainingOrderAction,
  actor: () => world.staff,
  input: async () => {
    const { appealId, documentId } = await forRestraint()
    return { appealId, issuedBy: 'zba', issuedOn: '2027-03-12', documentId }
  },
  fields: {
    appealId: uuid({ required: true }),
    issuedBy: choice({ required: true }),
    issuedOn: date({ required: true, ...PAST_ONLY }),
    documentId: uuid({ required: true }),
  },
  capability: 'enforcement.record_service',
  refusals: { ...STAFF_REFUSALS, invalid: restraintRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Restraining order recorded.' })
    const rows = await db
      .select({ issuedBy: restrainingOrders.issuedBy, issuedOn: restrainingOrders.issuedOn })
      .from(restrainingOrders)
      .where(eq(restrainingOrders.appealId, (await forRestraint()).appealId))
    expect(rows).toEqual([{ issuedBy: 'zba', issuedOn: '2027-03-12' }])
  },
})

describe('restrainingOrderAction with a document that is not a court document', () => {
  it('refuses beside the document and records nothing', async () => {
    h.signIn(world.staff)
    const { appealId, order } = await appealOnNewOrder('89 Willow Court')
    const proof = await uploadProof(h.db, h.store, world.staff, order.caseId)
    const { value, written } = await h.recordWrites(() =>
      actions.restrainingOrderAction(
        h.form({ appealId, issuedBy: 'zba', issuedOn: '2027-03-12', documentId: proof }),
      ),
    )
    expect(written).toEqual([])
    expect(value).toMatchObject({ ok: false, fieldErrors: { documentId: expect.any(String) } })
  })
})

const forDissolve = lazy(async () => {
  const { appealId, order } = await appealOnNewOrder('90 Willow Court')
  const documentId = await uploadProof(
    h.db,
    h.store,
    world.staff,
    order.caseId,
    'Court filing',
    'court_document',
  )
  const made = await recordRestrainingOrder(
    h.db,
    world.staff,
    { appealId, issuedBy: 'superior_court', issuedOn: '2027-03-12', documentId },
    signal,
  )
  if (!made.ok) throw new Error(made.error)
  return made.value.restrainingOrderId
})

describeActionCases(h, 'dissolveRestrainingOrderAction', {
  invoke: actions.dissolveRestrainingOrderAction,
  actor: () => world.staff,
  input: async () => ({ restrainingOrderId: await forDissolve(), dissolvedOn: '2027-04-01' }),
  fields: {
    restrainingOrderId: uuid({ required: true }),
    dissolvedOn: date({ required: true, ...PAST_ONLY }),
  },
  capability: 'enforcement.record_service',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: (variant) =>
      variant.field === 'restrainingOrderId'
        ? refuseField('restrainingOrderId', idMessage('a restraining order'))
        : refuseField('dissolvedOn', pastDateMessage('the date dissolved', variant)),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Restraining order marked dissolved.' })
    const [row] = await db
      .select({ dissolvedOn: restrainingOrders.dissolvedOn })
      .from(restrainingOrders)
      .where(eq(restrainingOrders.id, await forDissolve()))
    expect(row?.dissolvedOn).toBe('2027-04-01')
  },
})
