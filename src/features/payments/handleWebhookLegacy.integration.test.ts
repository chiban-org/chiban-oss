import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ledgerEntries, paymentAttempts, processorAccounts, processorEvents } from '@/db/schema'
import { handleWebhook } from '@/features/payments/handleWebhook'
import { encryptSecret } from '@/server/secrets'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  createFakeProcessor,
  type FakeProcessor,
  signFakePayload,
} from '@/test/fakes/fakeProcessor'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { ACCOUNT_REF, makeCardAttempt, processorState, setupPayments } from '@/test/paymentFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let fake: FakeProcessor
let olderAccountId: string

async function insertOlderRow(
  adminId: string,
  overrides: { accountRef?: string; webhookSecret?: string } = {},
): Promise<string> {
  const [row] = await handle.db
    .insert(processorAccounts)
    .values({
      processor: 'stripe',
      mode: 'test',
      accountRef: overrides.accountRef ?? ACCOUNT_REF,
      settings: {},
      credentialsEnc: encryptSecret(JSON.stringify({ secretKey: 'sk_test_old' })),
      webhookSecretEnc: encryptSecret(overrides.webhookSecret ?? 'whsec_old'),
      isActive: false,
      createdBy: adminId,
      createdAt: new Date('2020-01-01T00:00:00Z'),
    })
    .returning({ id: processorAccounts.id })
  return row?.id ?? ''
}

beforeEach(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  const trade = await submittedTrade(handle.db, world)
  await setupPayments(handle.db, world.admin)
  olderAccountId = await insertOlderRow(world.admin.userId)
  await makeCardAttempt(handle.db, trade)
  await handle.db.update(paymentAttempts).set({ processorObjectId: 'pi_1' })
  fake = createFakeProcessor()
  fake.setState('pi_1', processorState())
})
afterEach(async () => {
  await handle.drop()
})

function deliverTo(accountId: string, secret: string) {
  const raw = JSON.stringify({
    eventId: 'evt_legacy',
    type: 'payment.captured',
    objectId: 'pi_1',
    livemode: false,
  })
  return handleWebhook(
    handle.db,
    { now: NOW, processorFactory: () => fake },
    {
      accountId,
      rawBody: raw,
      headers: new Headers({ 'x-fake-signature': signFakePayload(secret, raw, NOW) }),
    },
    signal,
  )
}

const entryCount = async () => (await handle.db.select().from(ledgerEntries)).length

describe('webhook addresses saved before the account was kept in place', () => {
  it('an older address for the same merchant reconciles a payment started under the current one', async () => {
    expect(await deliverTo(olderAccountId, 'whsec_old')).toEqual({
      status: 200,
      body: { received: true },
    })
    expect(await entryCount()).toBe(1)
    const events = await handle.db
      .select()
      .from(processorEvents)
      .where(eq(processorEvents.processorAccountId, olderAccountId))
    expect(events).toMatchObject([{ outcome: 'reconciled' }])
  })

  it('an older address accepts the signing secret saved most recently for that merchant', async () => {
    expect((await deliverTo(olderAccountId, 'whsec_test')).status).toBe(200)
    expect(await entryCount()).toBe(1)
  })

  it('an older address for a different merchant does not reach this payment', async () => {
    const admin = (await handle.db.select().from(processorAccounts))[0]?.createdBy ?? ''
    const otherId = await insertOlderRow(admin, {
      accountRef: 'acct_other',
      webhookSecret: 'whsec_other',
    })
    expect((await deliverTo(otherId, 'whsec_test')).status).toBe(400)
    expect((await deliverTo(otherId, 'whsec_other')).status).toBe(200)
    expect(await entryCount()).toBe(0)
  })
})
