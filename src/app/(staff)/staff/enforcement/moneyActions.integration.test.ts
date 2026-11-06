import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { counselOutcomes, counselReferrals, enforcementFines } from '@/db/schema'
import { referToCounsel } from '@/features/enforcement/counsel'
import { fineBalance, recordFine } from '@/features/enforcement/fines'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage, textMessage } from '@/test/boardCases'
import { lazy } from '@/test/boardPanelFixtures'
import { intakeCase } from '@/test/enforcementActionFixtures'
import {
  ENFORCEMENT_NOW,
  moneyMessage,
  PAST_ONLY,
  pastDateMessage,
  useEnforcementClock,
} from '@/test/enforcementCases'
import {
  type EnforcementWorld,
  FIXTURE_NOW,
  issuedOrder,
  judgmentFor,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  type InvalidVariant,
  money,
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

const actions = await import('./moneyActions')

const h = actionHarness()
h.useObjectStore()
useEnforcementClock()
const signal = new AbortController().signal
let world: EnforcementWorld

beforeAll(async () => {
  world = await setupEnforcementWorld(h.db)
})

const forFine = lazy(async () => {
  const order = await issuedOrder(h.db, h.store, world, { location: '91 Aspen Drive' })
  const stepId = await judgmentFor(h.db, h.store, world, order)
  return { order, stepId }
})

function fineRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'caseId':
      return refuseField('caseId', idMessage('a case'))
    case 'basis':
      return refuseField('basis', 'Choose what the fine is based on.')
    case 'kind':
      return refuseField('kind', 'Choose a kind of fine.')
    case 'dollars':
      return refuseField('dollars', moneyMessage('the amount', variant))
    case 'imposedOn':
      return refuseField('imposedOn', pastDateMessage('the date imposed', variant))
    case 'court':
      return refuseField('court', textMessage('the court', 200, variant))
    default:
      return refuseField('docket', textMessage('the docket number', 100, variant))
  }
}

const fineFields = async () => {
  const { order, stepId } = await forFine()
  return {
    caseId: order.caseId,
    basis: `${order.orderId}:${stepId}`,
    kind: 'civil_penalty',
    dollars: '500.00',
    imposedOn: '2027-07-01',
    court: 'District Court, Alder Pond Division',
    docket: '2027-CV-0042',
  }
}

describeActionCases(h, 'fineAction', {
  invoke: actions.fineAction,
  actor: () => world.admin,
  input: fineFields,
  fields: {
    caseId: uuid({ required: true }),
    basis: choice({ required: true }),
    kind: choice({ required: true }),
    dollars: money({ required: true }),
    imposedOn: date({ required: true, ...PAST_ONLY }),
    court: text({ required: true, max: 200 }),
    docket: text({ required: true, max: 100 }),
  },
  capability: 'fine.record',
  refusals: { ...STAFF_REFUSALS, invalid: fineRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Fine recorded.' })
    const rows = await db
      .select({
        amountCents: enforcementFines.amountCents,
        imposedOn: enforcementFines.imposedOn,
        docket: enforcementFines.docket,
      })
      .from(enforcementFines)
      .where(eq(enforcementFines.caseId, (await forFine()).order.caseId))
    expect(rows).toEqual([{ amountCents: 50000, imposedOn: '2027-07-01', docket: '2027-CV-0042' }])
  },
})

describe('fineAction refusals the feature owns', () => {
  it('refuses a judgment that is not on this case beside the basis', async () => {
    h.signIn(world.admin)
    const { order } = await forFine()
    const fields = await fineFields()
    const { value, written } = await h.recordWrites(() =>
      actions.fineAction(h.form({ ...fields, basis: `${order.orderId}:${randomUUID()}` })),
    )
    expect({ value, written }).toEqual({
      value: refuseField('basis', 'A fine needs a recorded court judgment for this case.'),
      written: [],
    })
  })

  it('refuses an amount of $10,000,000.01 beside the amount', async () => {
    h.signIn(world.admin)
    const result = await actions.fineAction(
      h.form({ ...(await fineFields()), dollars: '10000000.01' }),
    )
    expect(result).toEqual(refuseField('dollars', 'Enter the amount from $0.01 to $10,000,000.00.'))
  })
})

const forRefer = lazy(() => intakeCase(h.db, world, '92 Aspen Drive'))

function referRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'caseId':
      return refuseField('caseId', idMessage('a case'))
    case 'counselName':
      return refuseField('counselName', textMessage('the counsel', 200, variant))
    case 'purpose':
      return refuseField('purpose', 'Choose a purpose.')
    default:
      return refuseField('referredOn', pastDateMessage('the date referred', variant))
  }
}

describeActionCases(h, 'referAction', {
  invoke: actions.referAction,
  actor: () => world.staff,
  input: async () => ({
    caseId: (await forRefer()).caseId,
    counselName: 'FS-C Counsel Esq',
    purpose: 'motion_to_enforce',
    referredOn: '2027-07-05',
  }),
  fields: {
    caseId: uuid({ required: true }),
    counselName: text({ required: true, max: 200 }),
    purpose: choice({ required: true }),
    referredOn: date({ required: true, ...PAST_ONLY }),
  },
  capability: 'enforcement.refer_counsel',
  refusals: { ...STAFF_REFUSALS, invalid: referRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Referred to counsel. The packet is on the case.',
    })
    const rows = await db
      .select({
        name: counselReferrals.counselName,
        referredOn: counselReferrals.referredOn,
        purpose: counselReferrals.purpose,
      })
      .from(counselReferrals)
      .where(eq(counselReferrals.caseId, (await forRefer()).caseId))
    expect(rows).toEqual([
      { name: 'FS-C Counsel Esq', referredOn: '2027-07-05', purpose: 'motion_to_enforce' },
    ])
    expect(written).toContain('documents')
  },
})

describe('referAction sweep findings', () => {
  it('refuses a referral dated 2099-01-01 beside the date and refers nothing (C-10)', async () => {
    h.signIn(world.staff)
    const { caseId } = await forRefer()
    const { value, written } = await h.recordWrites(() =>
      actions.referAction(
        h.form({
          caseId,
          counselName: 'FS-C Counsel Esq',
          purpose: 'motion_to_enforce',
          referredOn: '2099-01-01',
        }),
      ),
    )
    expect({ value, written }).toEqual({
      value: refuseField(
        'referredOn',
        'Enter the date referred between January 1, 1900 and July 20, 2027.',
      ),
      written: [],
    })
  })

  it('names the counsel field for a name of spaces and for one over 200 characters (C-07)', async () => {
    h.signIn(world.staff)
    const { caseId } = await forRefer()
    const refer = (counselName: string) =>
      h.form({ caseId, counselName, purpose: 'motion_to_enforce', referredOn: '2027-07-05' })
    expect(await actions.referAction(refer('   '))).toEqual(
      refuseField('counselName', 'Enter the counsel.'),
    )
    expect(await actions.referAction(refer('x'.repeat(201)))).toEqual(
      refuseField('counselName', 'Enter the counsel of 200 characters or fewer.'),
    )
  })
})

const forOutcome = lazy(async () => {
  const { caseId } = await intakeCase(h.db, world, '93 Aspen Drive')
  const referred = await referToCounsel(
    h.db,
    h.store,
    world.staff,
    {
      caseId,
      counselName: 'FS-C Counsel Esq',
      purpose: 'motion_to_enforce',
      referredOn: '2027-07-05',
    },
    signal,
    FIXTURE_NOW,
  )
  if (!referred.ok) throw new Error(referred.error)
  return referred.value.referralId
})

function outcomeRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'referralId':
      return refuseField('referralId', idMessage('a referral'))
    case 'kind':
      return refuseField('kind', 'Choose what happened.')
    case 'occurredOn':
      return refuseField('occurredOn', pastDateMessage('the date', variant))
    case 'court':
      return refuseField('court', textMessage('the court', 200, variant))
    case 'docket':
      return refuseField('docket', textMessage('the docket number', 100, variant))
    case 'documentId':
      return refuseField('documentId', 'Choose a document.')
    default:
      return refuseField('note', textMessage('a note', 2000, variant))
  }
}

describeActionCases(h, 'outcomeAction', {
  invoke: actions.outcomeAction,
  actor: () => world.staff,
  input: async () => ({
    referralId: await forOutcome(),
    kind: 'motion_filed',
    occurredOn: '2027-07-10',
    court: 'District Court',
    docket: '2027-CV-0042',
    documentId: '',
    note: 'Filed by counsel.',
  }),
  fields: {
    referralId: uuid({ required: true }),
    kind: choice({ required: true }),
    occurredOn: date({ required: true, ...PAST_ONLY }),
    court: text({ max: 200 }),
    docket: text({ max: 100 }),
    documentId: uuid(),
    note: text({ max: 2000 }),
  },
  capability: 'enforcement.refer_counsel',
  refusals: { ...STAFF_REFUSALS, invalid: outcomeRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Outcome recorded.' })
    const rows = await db
      .select({ kind: counselOutcomes.kind, occurredOn: counselOutcomes.occurredOn })
      .from(counselOutcomes)
      .where(eq(counselOutcomes.referralId, await forOutcome()))
    expect(rows).toEqual([{ kind: 'motion_filed', occurredOn: '2027-07-10' }])
  },
})

describe('outcomeAction with a document the case does not hold', () => {
  it('refuses beside the document and records nothing', async () => {
    h.signIn(world.staff)
    const { value, written } = await h.recordWrites(
      async () =>
        await actions.outcomeAction(
          h.form({
            referralId: await forOutcome(),
            kind: 'hearing_held',
            occurredOn: '2027-07-10',
            documentId: randomUUID(),
          }),
        ),
    )
    expect({ value, written }).toEqual({
      value: refuseField('documentId', 'Choose a document that belongs to this case.'),
      written: [],
    })
  })
})

const forPayment = lazy(async () => {
  const { order, stepId } = await forFine()
  const recorded = await recordFine(
    h.db,
    world.admin,
    {
      caseId: order.caseId,
      orderId: order.orderId,
      judgmentStepId: stepId,
      kind: 'costs_and_fees',
      amountCents: 20000,
      imposedOn: '2027-07-01',
      court: 'District Court',
      docket: '2027-CV-0043',
    },
    signal,
    ENFORCEMENT_NOW,
  )
  if (!recorded.ok) throw new Error(recorded.error)
  return recorded.value.fineId
})

function paymentRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'fineId':
      return refuseField('fineId', idMessage('a fine'))
    case 'dollars':
      return refuseField('dollars', moneyMessage('the amount', variant))
    case 'method':
      return refuseField('method', 'Choose how it was paid.')
    case 'checkNumber':
      return refuseField('checkNumber', textMessage('the check number', 50, variant))
    default:
      return refuseField('payerName', textMessage('the payer name', 200, variant))
  }
}

describeActionCases(h, 'finePaymentAction', {
  invoke: actions.finePaymentAction,
  actor: () => world.staff,
  input: async () => ({
    fineId: await forPayment(),
    dollars: '50.00',
    method: 'cash',
    checkNumber: '',
    payerName: 'Pat Owner',
  }),
  fields: {
    fineId: uuid({ required: true }),
    dollars: money({ required: true }),
    method: choice({ required: true }),
    checkNumber: text({ max: 50 }),
    payerName: text({ required: true, max: 200 }),
  },
  capability: 'payment.collect',
  refusals: { ...STAFF_REFUSALS, invalid: paymentRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Payment recorded.' })
    expect(await fineBalance(db, await forPayment(), signal)).toEqual({
      imposedCents: 20000,
      paidCents: 5000,
      dueCents: 15000,
    })
  },
})

describe('finePaymentAction refusals beside their fields', () => {
  it('asks for the check number when paying by check without one', async () => {
    h.signIn(world.staff)
    const { value, written } = await h.recordWrites(
      async () =>
        await actions.finePaymentAction(
          h.form({
            fineId: await forPayment(),
            dollars: '10.00',
            method: 'check',
            payerName: 'Pat Owner',
          }),
        ),
    )
    expect({ value, written }).toEqual({
      value: refuseField('checkNumber', 'Enter the check number.'),
      written: [],
    })
  })

  it('refuses more than the balance beside the amount', async () => {
    h.signIn(world.staff)
    const result = await actions.finePaymentAction(
      h.form({
        fineId: await forPayment(),
        dollars: '9000.00',
        method: 'cash',
        payerName: 'Pat Owner',
      }),
    )
    expect(result).toEqual(refuseField('dollars', 'That payment is more than what is due.'))
  })
})
