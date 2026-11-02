import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ledgerEntries, paymentAttempts, processorAccounts, processorEvents } from '@/db/schema'
import { handleWebhook } from '@/features/payments/handleWebhook'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  createFakeProcessor,
  type FakeProcessor,
  signFakePayload,
} from '@/test/fakes/fakeProcessor'
import { setupTradeWorld, submittedTrade, type TradeFixture } from '@/test/ledgerFixtures'
import { ACCOUNT_REF, makeCardAttempt, processorState, setupPayments } from '@/test/paymentFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const SECRET = 'whsec_test'
let handle: TestDb
let trade: TradeFixture
let fake: FakeProcessor
let accountId: string
let attemptId: string

beforeEach(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  trade = await submittedTrade(handle.db, world)
  accountId = (await setupPayments(handle.db, world.admin)).accountId
  attemptId = (await makeCardAttempt(handle.db, trade)).attemptId
  await handle.db.update(paymentAttempts).set({ processorObjectId: 'pi_1' })
  fake = createFakeProcessor()
  fake.setState('pi_1', processorState())
})
afterEach(async () => {
  await handle.drop()
})

interface EventBody {
  eventId?: string
  type?: string
  objectId?: string | null
  checkoutRef?: string | null
  accountRef?: string | null
  livemode?: boolean
}

function deliver(
  body: EventBody = {},
  options: { secret?: string; account?: string; raw?: string; at?: Date } = {},
) {
  const raw =
    options.raw ??
    JSON.stringify({
      eventId: 'evt_1',
      type: 'payment.captured',
      objectId: 'pi_1',
      livemode: false,
      ...body,
    })
  const headers = new Headers({
    'x-fake-signature': signFakePayload(options.secret ?? SECRET, raw, options.at ?? NOW),
  })
  return handleWebhook(
    handle.db,
    { now: NOW, processorFactory: () => fake },
    { accountId: options.account ?? accountId, rawBody: raw, headers },
    signal,
  )
}

const entryCount = async () => (await handle.db.select().from(ledgerEntries)).length
const eventRows = async () => await handle.db.select().from(processorEvents)

describe('handleWebhook', () => {
  it('valid event reconciles and returns 200', async () => {
    expect(await deliver()).toEqual({ status: 200, body: { received: true } })
    expect(await entryCount()).toBe(1)
    expect(await eventRows()).toMatchObject([{ eventId: 'evt_1', outcome: 'reconciled' }])
  })

  it('same event id twice returns duplicate and posts once', async () => {
    await deliver()
    expect(await deliver()).toEqual({ status: 200, body: { received: true, duplicate: true } })
    expect(await entryCount()).toBe(1)
    expect(await eventRows()).toHaveLength(1)
  })

  it('bad signature returns 400 and stores nothing', async () => {
    const r = await deliver({}, { raw: '{"eventId":"evt_1","objectId":"pi_1"}', secret: 'wrong' })
    expect(r).toEqual({ status: 400, body: { error: 'bad_signature' } })
    expect(await eventRows()).toHaveLength(0)
    expect(await entryCount()).toBe(0)
  })

  it("event signed with another account's secret returns 400", async () => {
    const r = await deliver({}, { secret: 'whsec_other_town' })
    expect(r.status).toBe(400)
    expect(await entryCount()).toBe(0)
  })

  it('a stale signature timestamp returns 400', async () => {
    const r = await deliver({}, { at: new Date(NOW.getTime() - 3_600_000) })
    expect(r).toEqual({ status: 400, body: { error: 'bad_signature' } })
  })

  it('event naming a different account ref is recorded foreign_object and posts nothing', async () => {
    const r = await deliver({ accountRef: 'acct_someone_else' })
    expect(r.status).toBe(200)
    expect(await eventRows()).toMatchObject([{ outcome: 'foreign_object' }])
    expect(await entryCount()).toBe(0)
  })

  it('an event naming this account ref is processed', async () => {
    await deliver({ accountRef: ACCOUNT_REF })
    expect(await entryCount()).toBe(1)
  })

  it('test-mode event on a live account is foreign_object', async () => {
    await handle.db
      .update(processorAccounts)
      .set({ mode: 'live' })
      .where(eq(processorAccounts.id, accountId))
    await deliver({ livemode: false })
    expect(await eventRows()).toMatchObject([{ outcome: 'foreign_object' }])
    expect(await entryCount()).toBe(0)
  })

  it('event for an unknown object is no_attempt', async () => {
    await deliver({ objectId: 'pi_unknown' })
    expect(await eventRows()).toMatchObject([{ outcome: 'no_attempt' }])
  })

  it('an event naming only a checkout resolves the object and reconciles', async () => {
    await handle.db.update(paymentAttempts).set({ processorObjectId: null, checkoutRef: 'cs_1' })
    fake.setCheckoutObject('cs_1', 'pi_1')
    await deliver({ objectId: null, checkoutRef: 'cs_1' })
    expect(await entryCount()).toBe(1)
    const [row] = await handle.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, attemptId))
    expect(row?.processorObjectId).toBe('pi_1')
  })

  it('unknown account id returns 404', async () => {
    const r = await deliver({}, { account: '00000000-0000-4000-8000-000000000000' })
    expect(r).toEqual({ status: 404, body: { error: 'unknown_account' } })
  })

  it('an account id that is not a uuid returns 404', async () => {
    const r = await deliver({}, { account: 'not-a-uuid' })
    expect(r).toEqual({ status: 404, body: { error: 'unknown_account' } })
  })

  it('trailing whitespace in the raw body still verifies', async () => {
    const raw = `${JSON.stringify({ eventId: 'evt_ws', type: 'payment.captured', objectId: 'pi_1' })}\n  `
    expect((await deliver({}, { raw })).status).toBe(200)
  })

  it('a processor lookup failure returns 500 and a redelivery reconciles', async () => {
    fake.setState('pi_1', undefined as never)
    const broken = createFakeProcessor()
    const failing = await handleWebhook(
      handle.db,
      { now: NOW, processorFactory: () => broken },
      {
        accountId,
        rawBody: JSON.stringify({ eventId: 'evt_r', objectId: 'pi_1' }),
        headers: new Headers({
          'x-fake-signature': signFakePayload(
            SECRET,
            JSON.stringify({ eventId: 'evt_r', objectId: 'pi_1' }),
            NOW,
          ),
        }),
      },
      signal,
    )
    expect(failing.status).toBe(500)
    expect(await entryCount()).toBe(0)
    fake.setState('pi_1', processorState())
    expect((await deliver({ eventId: 'evt_r' })).status).toBe(200)
    expect(await entryCount()).toBe(1)
    expect(await eventRows()).toMatchObject([{ eventId: 'evt_r', outcome: 'reconciled' }])
  })
})
