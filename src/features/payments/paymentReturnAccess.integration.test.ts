import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { paymentAttempts } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { attemptReceiptPdfResponse, paymentReturnDetails } from '@/features/payments/paymentReturn'
import { resolveDevCheckout } from '@/features/payments/simulatedCheckout'
import { startOnlinePayment } from '@/features/payments/startPayment'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld, submittedTrade, type TradeFixture } from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { setupPayments } from '@/test/paymentFixtures'

const signal = new AbortController().signal
const deps = { now: new Date('2027-03-02T17:00:00Z'), enabled: true }
let handle: TestDb
let trade: TradeFixture
let attemptId = ''
let stranger: Actor
let inspector: Actor
let reviewer: Actor
let finance: Actor
let creatorOnly: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  trade = await submittedTrade(handle.db, world)
  await setupPayments(handle.db, world.admin, 'simulated', 'sim_town')
  const started = await startOnlinePayment(
    handle.db,
    world.applicant,
    { applicationIds: [trade.applicationId], payerName: 'Alex Applicant' },
    signal,
    deps,
  )
  if (!started.ok) throw new Error('start failed')
  attemptId = started.value.attemptId
  const [attempt] = await handle.db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, attemptId))
  await resolveDevCheckout(handle.db, attempt?.processorObjectId ?? '', 'approve', signal, deps)
  stranger = await staffActor(handle.db, 'applicant')
  creatorOnly = await staffActor(handle.db, 'applicant')
  await handle.db
    .update(paymentAttempts)
    .set({ createdByUserId: creatorOnly.userId })
    .where(eq(paymentAttempts.id, attemptId))
  inspector = await staffActor(handle.db, 'inspector')
  reviewer = await staffActor(handle.db, 'reviewer')
  finance = await staffActor(handle.db, 'finance')
})
afterAll(async () => {
  await handle.drop()
})

describe('payment return access', () => {
  it('the payer sees the details and the receipt', async () => {
    const details = await paymentReturnDetails(handle.db, trade.world.applicant, attemptId, signal)
    expect(details.status).toBe('received')
    const pdf = await attemptReceiptPdfResponse(handle.db, trade.world.applicant, attemptId, signal)
    expect(pdf.status).toBe(200)
  })

  it('the creating user sees the details and the receipt', async () => {
    const details = await paymentReturnDetails(handle.db, creatorOnly, attemptId, signal)
    expect(details.status).toBe('received')
    expect(
      (await attemptReceiptPdfResponse(handle.db, creatorOnly, attemptId, signal)).status,
    ).toBe(200)
  })

  it('finance staff see the details and the receipt', async () => {
    const details = await paymentReturnDetails(handle.db, finance, attemptId, signal)
    expect(details.status).toBe('received')
    expect((await attemptReceiptPdfResponse(handle.db, finance, attemptId, signal)).status).toBe(
      200,
    )
  })

  it.each([
    ['another public user', () => stranger],
    ['a signed-out visitor', () => null],
    ['an inspector without ledger visibility', () => inspector],
    ['a reviewer without ledger visibility', () => reviewer],
  ])('%s gets the unknown-attempt answer', async (_name, who) => {
    const unknown = await paymentReturnDetails(
      handle.db,
      who(),
      '00000000-0000-4000-8000-000000000000',
      signal,
    )
    expect(await paymentReturnDetails(handle.db, who(), attemptId, signal)).toEqual(unknown)
    expect(unknown.status).toBe('not_found')
    const pdf = await attemptReceiptPdfResponse(handle.db, who(), attemptId, signal)
    expect(pdf.status).toBe(404)
  })
})
