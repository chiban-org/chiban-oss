import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { seedParcelWorld } from '@/test/parcels'
import {
  actionHarness,
  choice,
  describeActionCases,
  type InvalidVariant,
  STAFF_REFUSALS,
  text,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { saveProcessorAccountAction } = await import('./actions')

const h = actionHarness()
beforeAll(async () => {
  await seedParcelWorld(h.db)
})

const STRIPE = {
  processor: 'stripe',
  mode: 'test',
  accountRef: 'acct_new',
  secretKey: 'sk_test_456',
  webhookSecret: 'whsec_456',
}

function refusalFor(variant: InvalidVariant) {
  const long = variant.kind === 'too_long'
  switch (variant.field) {
    case 'processor':
      return refuseField('processor', 'Choose a processor.')
    case 'mode':
      return refuseField('mode', 'Choose a mode.')
    case 'accountRef':
      return refuseField(
        'accountRef',
        long
          ? 'Enter the account number at the processor of 200 characters or fewer.'
          : 'Enter the account number at the processor.',
      )
    default:
      return refuseField(
        'webhookSecret',
        'Enter the webhook signing secret of 500 characters or fewer.',
      )
  }
}

describeActionCases(h, 'saveProcessorAccountAction', {
  invoke: saveProcessorAccountAction,
  actor: () => h.actorFor('admin'),
  input: () => STRIPE,
  fields: {
    processor: choice({ required: true }),
    mode: choice({ required: true }),
    accountRef: text({ required: true, max: 200 }),
    webhookSecret: text({ max: 500 }),
  },
  capability: 'config.edit',
  refusals: { ...STAFF_REFUSALS, invalid: refusalFor, checkOnly: CHECK_PASSED },
  accepted: (result, { written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Processor account saved. The connection has not been verified yet.',
    })
    expect(JSON.stringify(result)).not.toContain('sk_test_456')
    expect(written).toEqual(['audit_log', 'processor_accounts'])
  },
})

describe('saveProcessorAccountAction refusals beside their fields', () => {
  async function save(fields: Record<string, string>) {
    h.signIn(await h.actorFor('admin'))
    return await h.recordWrites(() => saveProcessorAccountAction(h.form({ ...STRIPE, ...fields })))
  }

  it('names the secret key when a Stripe account has none', async () => {
    const { value, written } = await save({ secretKey: '' })
    expect({ value, written }).toEqual({
      value: refuseField('secretKey', 'Enter the secret key.'),
      written: [],
    })
  })

  it('saves a first account with no webhook signing secret', async () => {
    const { value } = await save({ webhookSecret: '', accountRef: 'acct_no_secret' })
    expect(value).toMatchObject({ ok: true })
  })

  it('names the Clover addresses when they are missing', async () => {
    const { value } = await save({ processor: 'clover' })
    expect(value).toEqual({
      ok: false,
      error: 'Enter the Clover API address. Enter the Clover checkout address.',
      fieldErrors: {
        apiBase: 'Enter the Clover API address.',
        ecommBase: 'Enter the Clover checkout address.',
      },
    })
  })

  it('saves a Clover account when every field is given', async () => {
    const { value } = await save({
      processor: 'clover',
      apiBase: 'https://api.clover.example',
      ecommBase: 'https://ecomm.clover.example',
    })
    expect(value).toMatchObject({ ok: true })
  })
})
