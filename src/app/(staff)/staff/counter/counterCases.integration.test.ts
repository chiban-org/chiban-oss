import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { CounterOutcome } from '@/components/counter/counterTypes'
import { applications } from '@/db/schema'
import { refuseField } from '@/server/formInput'
import type { PermitWorld } from '@/test/applicationFixtures'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import { setupPayments } from '@/test/paymentFixtures'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
  describeActionCases,
  money,
  rolesLacking,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'
import type { Refusals } from '@/test/testHarness/actions/cases'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const { quickIssueAction } = await import('./actions')

const h = actionHarness()
let world: PermitWorld

beforeAll(async () => {
  world = (await setupTradeWorld(h.db)).world
  await setupPayments(h.db, world.admin, 'simulated', 'sim_town')
})

const COUNTER_REFUSALS = STAFF_REFUSALS as unknown as Refusals<CounterOutcome>
const TENDERED = {
  below_min: 'Enter the cash tendered from $0.01 to $10,000,000.00.',
  otherwise: 'Enter the cash tendered in dollars and cents, like 25.00.',
}

const issueFields = () => ({
  parcelId: world.parcelId,
  typeKey: 'EL',
  contractorName: 'Pat Contractor',
  licenseNumber: 'EL-20418',
  licenseType: 'Electrician',
  licenseResult: 'active',
  method: 'cash',
  tendered: '50',
  'value.description': 'Panel upgrade',
})

describeActionCases(h, 'quickIssueAction', {
  invoke: quickIssueAction,
  actor: () => h.actorFor('staff'),
  input: () => issueFields(),
  fields: {
    parcelId: uuid({ required: true }),
    typeKey: text({ required: true, max: 100 }),
    contractorName: text({ required: true, max: 200 }),
    method: choice({ required: true }),
    tendered: money(),
    payerName: text({ max: 200 }),
  },
  refusedRoles: rolesLacking('permit.issue'),
  refusals: {
    ...COUNTER_REFUSALS,
    invalid: refusalFor({
      parcelId: 'Choose a parcel.',
      typeKey: {
        missing: 'Enter a permit type.',
        whitespace: 'Enter a permit type.',
        otherwise: 'Enter a permit type of 100 characters or fewer.',
      },
      contractorName: {
        missing: 'Enter the contractor name.',
        whitespace: 'Enter the contractor name.',
        otherwise: 'Enter the contractor name of 200 characters or fewer.',
      },
      method: 'Choose a payment method.',
      tendered: TENDERED,
      payerName: 'Enter the payer name of 200 characters or fewer.',
    }),
  },
  accepted: async (result, { db, written }) => {
    expect(result).toMatchObject({ ok: true, state: 'issued' })
    expect(written).toEqual(
      expect.arrayContaining(['applications', 'audit_log', 'ledger_entries', 'receipts']),
    )
    const applicationId = 'applicationId' in result ? result.applicationId : ''
    const [row] = await db
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.id, applicationId))
    expect(row?.state).toBe('issued')
  },
})

describe('counter sweep findings', () => {
  it('names the contractor name field for a name of spaces and issues nothing', async () => {
    h.signIn(await h.actorFor('staff'))
    const outcome = await h.recordWrites(() =>
      quickIssueAction(h.form({ ...issueFields(), contractorName: '   ' })),
    )
    expect(outcome).toEqual({
      value: refuseField('contractorName', 'Enter the contractor name.'),
      written: [],
    })
  })

  it('names the check number field when paying by check without one', async () => {
    h.signIn(await h.actorFor('staff'))
    const result = await quickIssueAction(h.form({ ...issueFields(), method: 'check' }))
    expect(result).toEqual(refuseField('checkNumber', 'Enter the check number.'))
  })

  it('names the license fields left blank when only some are given', async () => {
    h.signIn(await h.actorFor('staff'))
    const result = await quickIssueAction(
      h.form({ ...issueFields(), licenseType: '', licenseResult: '' }),
    )
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        licenseType: 'Fill in all the license fields.',
        licenseResult: 'Fill in all the license fields.',
      },
    })
  })

  it('names the license number when the permit type needs a license and none is given', async () => {
    h.signIn(await h.actorFor('staff'))
    const result = await quickIssueAction(
      h.form({ ...issueFields(), licenseNumber: '', licenseType: '', licenseResult: '' }),
    )
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { licenseNumber: expect.stringContaining('license') },
    })
  })
})
