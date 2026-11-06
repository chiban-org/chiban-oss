import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ledgerEntries } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import type { PermitWorld } from '@/test/applicationFixtures'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { setupPayments } from '@/test/paymentFixtures'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
  describeActionCases,
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
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const { recordPaymentAction } = await import('./actions')

const h = actionHarness()
let world: PermitWorld

beforeAll(async () => {
  world = (await setupTradeWorld(h.db)).world
  await setupPayments(h.db, world.admin)
})

const freshPermit = async () => (await submittedTrade(h.db, world)).applicationId
const clerk = () => h.actorFor('staff')

describeActionCases(h, 'recordPaymentAction', {
  invoke: recordPaymentAction,
  actor: clerk,
  input: async () => ({
    applicationId: await freshPermit(),
    method: 'cash',
    amount: '45.00',
    tendered: '50.00',
    payerName: 'Pat Contractor',
  }),
  fields: {
    applicationId: uuid({ required: true }),
    method: choice({ required: true }),
    amount: money({ required: true }),
    checkNumber: text({ max: 50 }),
    tendered: money(),
    payerName: text({ required: true, max: 200 }),
  },
  capability: 'payment.collect',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      method: 'Choose how it was paid.',
      amount: {
        missing: 'Enter the amount.',
        below_min: 'Enter the amount from $0.01 to $10,000,000.00.',
        otherwise: 'Enter the amount in dollars and cents, like 25.00.',
      },
      checkNumber: 'Enter the check number of 50 characters or fewer.',
      tendered: {
        below_min: 'Enter the cash tendered from $0.01 to $10,000,000.00.',
        otherwise: 'Enter the cash tendered in dollars and cents, like 25.00.',
      },
      payerName: {
        missing: 'Enter the payer name.',
        whitespace: 'Enter the payer name.',
        otherwise: 'Enter the payer name of 200 characters or fewer.',
      },
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({
      ok: true,
      message: expect.stringMatching(
        /^Payment recorded on receipt R-\d{4}-\d{6}\. Change due \$5\.00\.$/,
      ),
    })
    expect(written).toEqual(
      expect.arrayContaining(['audit_log', 'ledger_entries', 'ledger_allocations', 'receipts']),
    )
    const rows = await db
      .select({ amountCents: ledgerEntries.amountCents, payerName: ledgerEntries.payerName })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.payerName, 'Pat Contractor'))
    expect(rows).toContainEqual({ amountCents: 4500, payerName: 'Pat Contractor' })
  },
})

describe('the sweep findings on recording a payment', () => {
  it.each([
    ['0', 'Enter the amount from $0.01 to $10,000,000.00.'],
    ['-5', 'Enter the amount in dollars and cents, like 25.00.'],
    ['1.005', 'Enter the amount in dollars and cents, like 25.00.'],
    ['abc', 'Enter the amount in dollars and cents, like 25.00.'],
  ])('names the amount field for "%s" and records nothing', async (amount, copy) => {
    h.signIn(await clerk())
    const form = h.form({
      applicationId: await freshPermit(),
      method: 'check',
      checkNumber: '123',
      amount,
      payerName: 'FS-B 1',
    })
    const outcome = await h.recordWrites(() => recordPaymentAction(form))
    expect(outcome).toEqual({ value: refuseField('amount', copy), written: [] })
  })

  it('names the payer field for a payer of three spaces and records nothing', async () => {
    h.signIn(await clerk())
    const form = h.form({
      applicationId: await freshPermit(),
      method: 'cash',
      amount: '45.00',
      payerName: '   ',
    })
    const outcome = await h.recordWrites(() => recordPaymentAction(form))
    expect(outcome).toEqual({
      value: refuseField('payerName', 'Enter the payer name.'),
      written: [],
    })
  })

  it('names the check number field when paying by check without one', async () => {
    h.signIn(await clerk())
    const result = await recordPaymentAction(
      h.form({
        applicationId: await freshPermit(),
        method: 'check',
        amount: '45.00',
        payerName: 'Pat',
      }),
    )
    expect(result).toEqual(refuseField('checkNumber', 'Enter the check number.'))
  })

  it('names the amount field for a payment over what is due', async () => {
    h.signIn(await clerk())
    const result = await recordPaymentAction(
      h.form({
        applicationId: await freshPermit(),
        method: 'cash',
        amount: '90.00',
        payerName: 'Pat',
      }),
    )
    expect(result).toEqual(refuseField('amount', 'That payment is more than what is due.'))
  })

  it('names the tendered field when the cash tendered is short', async () => {
    h.signIn(await clerk())
    const result = await recordPaymentAction(
      h.form({
        applicationId: await freshPermit(),
        method: 'cash',
        amount: '45.00',
        tendered: '20.00',
        payerName: 'Pat',
      }),
    )
    expect(result).toEqual(
      refuseField('tendered', 'The cash tendered is less than the amount due.'),
    )
  })
})
