import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { processorEvents } from '@/db/schema'
import { handleWebhook } from '@/features/payments/handleWebhook'
import {
  getActiveProcessor,
  type SaveProcessorAccountInput,
  saveProcessorAccount,
} from '@/features/payments/processorAccounts'
import { createProcessor } from '@/features/payments/processors/registry'
import { makeTestDb, type TestDb } from '@/test/db'
import { createFakeProcessor, signFakePayload } from '@/test/fakes/fakeProcessor'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

const stripeInput: SaveProcessorAccountInput = {
  processor: 'stripe',
  mode: 'test',
  accountRef: 'acct_alder',
  settings: {},
  credentials: { secretKey: 'sk_test_123' },
  webhookSecret: null,
}

async function save(
  webhookSecret: string | null,
  overrides: Partial<SaveProcessorAccountInput> = {},
) {
  const admin = await staffActor(handle.db, 'admin')
  const saved = await saveProcessorAccount(
    handle.db,
    admin,
    { ...stripeInput, ...overrides, webhookSecret },
    signal,
  )
  if (!saved.ok) throw new Error(saved.error)
  return saved.value.accountId
}

async function savedSecret(): Promise<string | null> {
  const active = await getActiveProcessor(handle.db, signal)
  return active.state === 'known' ? active.value.webhookSecret : null
}

describe('the webhook signing secret', () => {
  it('may be left out on the first save', async () => {
    await save(null)
    expect(await savedSecret()).toBe('')
  })

  it('left blank on a later save keeps the saved one', async () => {
    await save('whsec_abc')
    await save(null, { credentials: { secretKey: 'sk_test_456' } })
    expect(await savedSecret()).toBe('whsec_abc')
  })

  it('entered on a later save replaces the saved one', async () => {
    await save(null)
    await save('whsec_new')
    expect(await savedSecret()).toBe('whsec_new')
  })

  it('left blank for a different merchant is stored as missing', async () => {
    await save('whsec_abc')
    await save(null, { accountRef: 'acct_other' })
    expect(await savedSecret()).toBe('')
  })

  it('missing means every event is refused and nothing is recorded', async () => {
    const accountId = await save(null)
    const raw = JSON.stringify({ eventId: 'evt_1', type: 'payment.captured', objectId: 'pi_1' })
    const fake = createFakeProcessor()
    const result = await handleWebhook(
      handle.db,
      { now: NOW, processorFactory: () => fake },
      {
        accountId,
        rawBody: raw,
        headers: new Headers({ 'x-fake-signature': signFakePayload('', raw, NOW) }),
      },
      signal,
    )
    expect(result).toEqual({ status: 400, body: { error: 'bad_signature' } })
    expect(await handle.db.select().from(processorEvents)).toHaveLength(0)
  })

  it('missing still leaves a Clover account able to take card payments', async () => {
    await save(null, {
      processor: 'clover',
      credentials: { privateToken: 'clover_token' },
      settings: {
        apiBase: 'https://api.clover.example',
        ecommBase: 'https://ecomm.clover.example',
      },
    })
    const active = await getActiveProcessor(handle.db, signal)
    if (active.state !== 'known') throw new Error(active.state)
    expect(() =>
      createProcessor(active.value.account, active.value.credentials, { fetch, db: handle.db }),
    ).not.toThrow()
  })
})
