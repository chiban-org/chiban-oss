import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ledgerEntries, paymentAttempts } from '@/db/schema'
import { runJob } from '@/jobs/defineJob'
import { makePaymentsReconcileJob, paymentsReconcileJob } from '@/jobs/paymentsReconcile'
import { makeTestDb, type TestDb } from '@/test/db'
import { createFakeProcessor, type FakeProcessor } from '@/test/fakes/fakeProcessor'
import { setupTradeWorld, submittedTrade, type TradeFixture } from '@/test/ledgerFixtures'
import { makeCardAttempt, processorState, setupPayments } from '@/test/paymentFixtures'

const signal = new AbortController().signal
const AT = '2027-03-02T18:15:00.000Z'
let handle: TestDb
let trade: TradeFixture
let fake: FakeProcessor

beforeEach(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  trade = await submittedTrade(handle.db, world)
  await setupPayments(handle.db, world.admin)
  fake = createFakeProcessor()
})
afterEach(async () => {
  await handle.drop()
})

const job = () => makePaymentsReconcileJob({ processorFactory: () => fake })
const run = (at: string = AT) => runJob(handle.db, job(), { at }, signal)

async function attemptIn(
  state: 'pending' | 'authorized' | 'captured',
  objectId: string,
  target: TradeFixture = trade,
  patch: Partial<typeof paymentAttempts.$inferInsert> = {},
) {
  const { attemptId } = await makeCardAttempt(handle.db, target)
  await handle.db
    .update(paymentAttempts)
    .set({
      state,
      processorObjectId: objectId,
      updatedAt: new Date('2027-03-02T17:00:00Z'),
      ...patch,
    })
    .where(eq(paymentAttempts.id, attemptId))
  return attemptId
}

const stateOf = async (id: string) =>
  (await handle.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, id)))[0]

describe('payments.reconcile', () => {
  it('reconcile job captures an authorized attempt the processor now reports captured', async () => {
    const id = await attemptIn('authorized', 'pi_1')
    fake.setState('pi_1', processorState())
    expect((await run()).ok).toBe(true)
    expect((await stateOf(id))?.state).toBe('captured')
    expect(await handle.db.select().from(ledgerEntries)).toMatchObject([
      { amountCents: 4635, actorKind: 'system', actorJob: 'payments.reconcile' },
    ])
  })

  it('one processor error does not stop the run and is recorded', async () => {
    const { world } = trade
    const other = await submittedTrade(handle.db, world)
    const broken = await attemptIn('authorized', 'pi_broken')
    const fine = await attemptIn('authorized', 'pi_ok', other)
    fake.failFor('pi_broken')
    fake.setState('pi_ok', processorState({ objectId: 'pi_ok' }))
    expect((await run()).ok).toBe(true)
    expect(await stateOf(broken)).toMatchObject({
      state: 'authorized',
      lastCheckError: 'unreachable: fake outage',
    })
    expect((await stateOf(fine))?.state).toBe('captured')
  })

  it('a payment object from another processor account is recorded as foreign_object, not as a clean check', async () => {
    const id = await attemptIn('authorized', 'pi_foreign')
    fake.setState(
      'pi_foreign',
      processorState({ objectId: 'pi_foreign', accountRef: 'acct_other' }),
    )
    await run()
    const row = await stateOf(id)
    expect(row?.state).toBe('authorized')
    expect(row?.lastCheckError).toBe('foreign_object')
  })

  it('an object the processor does not know is recorded as not_found', async () => {
    const id = await attemptIn('authorized', 'pi_gone')
    await run()
    expect((await stateOf(id))?.lastCheckError).toBe('not_found')
  })

  it('job twice in one hour has one effect', async () => {
    await attemptIn('authorized', 'pi_1')
    fake.setState('pi_1', processorState())
    await run('2027-03-02T18:05:00.000Z')
    const reads = fake.stateReads
    await run('2027-03-02T18:55:00.000Z')
    expect(fake.stateReads).toBe(reads)
    expect(await handle.db.select().from(ledgerEntries)).toHaveLength(1)
  })

  it('the next hour checks again', async () => {
    await attemptIn('authorized', 'pi_1')
    fake.setState('pi_1', processorState())
    await run('2027-03-02T18:05:00.000Z')
    const reads = fake.stateReads
    await run('2027-03-02T19:05:00.000Z')
    expect(fake.stateReads).toBeGreaterThan(reads)
  })

  it('resolves an attempt with an unknown outcome', async () => {
    const id = await attemptIn('pending', 'pi_1', trade, {
      outcomeUnknown: true,
      updatedAt: new Date(AT),
    })
    fake.setState('pi_1', processorState({ status: 'declined' }))
    await run()
    expect(await stateOf(id)).toMatchObject({ state: 'declined', outcomeUnknown: false })
  })

  it('leaves a fresh pending attempt alone and checks one older than 10 minutes', async () => {
    const fresh = await attemptIn('pending', 'pi_1', trade, {
      updatedAt: new Date('2027-03-02T18:10:00Z'),
    })
    fake.setState('pi_1', processorState({ status: 'authorized' }))
    await run()
    expect((await stateOf(fresh))?.state).toBe('pending')
    await handle.db.update(paymentAttempts).set({ updatedAt: new Date('2027-03-02T17:00:00Z') })
    await run('2027-03-02T19:00:00.000Z')
    expect((await stateOf(fresh))?.state).toBe('authorized')
  })

  it('skips pending attempts that have no processor object yet', async () => {
    const id = await attemptIn('pending', 'pi_1')
    await handle.db
      .update(paymentAttempts)
      .set({ processorObjectId: null })
      .where(eq(paymentAttempts.id, id))
    await run()
    expect(fake.stateReads).toBe(0)
  })

  it('is registered under its name with an hourly interval', () => {
    expect(paymentsReconcileJob.name).toBe('payments.reconcile')
    expect(paymentsReconcileJob.intervalSeconds).toBe(3600)
    expect(paymentsReconcileJob.dedupKey({ at: AT })).toBe('payments.reconcile:2027-03-02T18')
  })
})
