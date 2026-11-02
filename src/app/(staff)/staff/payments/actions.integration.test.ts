import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ledgerEntries, paymentAttempts, processorAccounts } from '@/db/schema'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { feeBalance } from '@/features/ledger/feeBalance'
import { loadPaymentsOverview } from '@/features/payments/overview'
import { getPaymentSettings } from '@/features/payments/paymentSettings'
import { reconcileAttempt } from '@/features/payments/reconcileAttempt'
import { loadProcessorSettings } from '@/features/payments/settingsView'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
} from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { makeCardAttempt, processorState, setupPayments } from '@/test/paymentFixtures'

interface MockState {
  db: unknown
  csrfCookie: string | null
  actor: unknown
}

const state = vi.hoisted((): MockState => ({ db: null, csrfCookie: 'tok', actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'chiban_csrf' && state.csrfCookie !== null
          ? { value: state.csrfCookie }
          : undefined,
    }),
  headers: () =>
    Promise.resolve(
      new Headers({
        origin: 'https://alderpond.example',
        host: 'alderpond.example',
        'sec-fetch-site': 'same-origin',
      }),
    ),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const actions = await import('@/app/(staff)/staff/payments/actions')
const settingsActions = await import('@/app/(staff)/staff/settings/payments/actions')

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let world: PermitWorld
let trade: TradeFixture

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  const made = await setupTradeWorld(handle.db)
  world = made.world
  trade = await submittedTrade(handle.db, world)
  await setupPayments(handle.db, world.admin)
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  state.csrfCookie = 'tok'
  state.actor = world.staff
})

function form(fields: Record<string, string>, token: string | null = 'tok'): FormData {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const CSRF_COPY = 'Your session expired. Reload the page and try again.'
let cashEntryId = ''

async function cashEntry(): Promise<string> {
  if (cashEntryId !== '') return cashEntryId
  const paid = await recordCounterPayment(
    handle.db,
    world.staff,
    {
      method: 'cash',
      amountCents: 4500,
      payerName: 'Pat',
      allocations: [lineAllocation(trade, 4500)],
    },
    signal,
    NOW,
  )
  if (!paid.ok) throw new Error(paid.error)
  cashEntryId = paid.value.entryId
  return cashEntryId
}

describe('refund and correction actions', () => {
  it('refund action as staff is forbidden', async () => {
    const entryId = await cashEntry()
    const r = await actions.refundAction(
      form({ entryId, amount: '10.00', reason: 'Permit pulled in error' }),
    )
    expect(r).toEqual({ ok: false, error: 'You do not have permission to do this.' })
  })

  it('refund action without csrf is refused', async () => {
    const entryId = await cashEntry()
    state.actor = world.admin
    const r = await actions.refundAction(
      form({ entryId, amount: '10.00', reason: 'Permit pulled in error' }, null),
    )
    expect(r).toEqual({ ok: false, error: CSRF_COPY })
  })

  it('every money action refuses a missing csrf token', async () => {
    state.actor = world.admin
    for (const action of [
      actions.checkWithProcessorAction,
      actions.voidAttemptAction,
      actions.returnedCheckAction,
      actions.chargebackAction,
      actions.correctAction,
      settingsActions.saveProcessorAccountAction,
      settingsActions.publishPaymentSettingsAction,
    ]) {
      expect(await action(form({}, null))).toEqual({ ok: false, error: CSRF_COPY })
    }
  })

  it('finance refunds dollars and the ledger gets negative cents', async () => {
    const entryId = await cashEntry()
    state.actor = await staffActor(handle.db, 'finance')
    const r = await actions.refundAction(
      form({ entryId, amount: '10.50', reason: 'Permit pulled in error' }),
    )
    expect(r.ok).toBe(true)
    const refunds = await handle.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.entryType, 'refund'))
    expect(refunds).toMatchObject([{ amountCents: -1050 }])
  })

  it('refund over the net paid is explained', async () => {
    const entryId = await cashEntry()
    state.actor = await staffActor(handle.db, 'finance')
    const r = await actions.refundAction(
      form({ entryId, amount: '999.00', reason: 'Permit pulled in error' }),
    )
    expect(r.ok === false && r.error).toBe('That is more than was paid.')
  })

  it('a bad amount is invalid input', async () => {
    const entryId = await cashEntry()
    state.actor = await staffActor(handle.db, 'finance')
    const r = await actions.refundAction(
      form({ entryId, amount: 'ten', reason: 'Permit pulled in error' }),
    )
    expect(r).toEqual({ ok: false, error: 'Check the form fields and try again.' })
  })

  it('a returned check on cash payment is explained', async () => {
    const entryId = await cashEntry()
    state.actor = await staffActor(handle.db, 'finance')
    const r = await actions.returnedCheckAction(
      form({ entryId, returnedOn: '2027-03-05', reason: 'Insufficient funds notice' }),
    )
    expect(r.ok === false && r.error).toBe('That payment was not made by check.')
  })

  it('finance moves a payment from one permit to another', async () => {
    const wrong = await submittedTrade(handle.db, world)
    const target = await submittedTrade(handle.db, world)
    const paid = await recordCounterPayment(
      handle.db,
      world.staff,
      {
        method: 'cash',
        amountCents: 4500,
        payerName: 'Pat',
        allocations: [lineAllocation(wrong, 4500)],
      },
      signal,
      NOW,
    )
    if (!paid.ok) throw new Error(paid.error)
    state.actor = await staffActor(handle.db, 'finance')
    const r = await actions.correctAction(
      form({
        entryId: paid.value.entryId,
        reason: 'Keyed against the wrong permit',
        targetApplicationId: target.applicationId,
        amount: '45.00',
      }),
    )
    expect(r.ok).toBe(true)
    expect((await feeBalance(handle.db, wrong.applicationId, signal)).dueCents).toBe(4500)
    expect((await feeBalance(handle.db, target.applicationId, signal)).dueCents).toBe(0)
  })

  it('a correction with nowhere to put the money is explained', async () => {
    const paid = await submittedTrade(handle.db, world)
    const settled = await submittedTrade(handle.db, world)
    const entry = await recordCounterPayment(
      handle.db,
      world.staff,
      {
        method: 'cash',
        amountCents: 4500,
        payerName: 'Pat',
        allocations: [lineAllocation(paid, 4500)],
      },
      signal,
      NOW,
    )
    await recordCounterPayment(
      handle.db,
      world.staff,
      {
        method: 'cash',
        amountCents: 4500,
        payerName: 'Pat',
        allocations: [lineAllocation(settled, 4500)],
      },
      signal,
      NOW,
    )
    if (!entry.ok) throw new Error(entry.error)
    state.actor = await staffActor(handle.db, 'finance')
    const r = await actions.correctAction(
      form({
        entryId: entry.value.entryId,
        reason: 'Keyed against the wrong permit',
        targetApplicationId: settled.applicationId,
        amount: '45.00',
      }),
    )
    expect(r).toEqual({ ok: false, error: 'No fee line on that application can take this amount.' })
  })

  it('a correction that moves nothing is refused', async () => {
    const entryId = await cashEntry()
    state.actor = await staffActor(handle.db, 'finance')
    const r = await actions.correctAction(
      form({
        entryId,
        reason: 'Keyed against the wrong permit',
        targetApplicationId: trade.applicationId,
        amount: '0',
      }),
    )
    expect(r.ok).toBe(false)
  })
})

describe('attempt actions', () => {
  it('void action voids a pending attempt that never reached the processor', async () => {
    const { attemptId } = await makeCardAttempt(handle.db, trade)
    state.actor = await staffActor(handle.db, 'finance')
    const voided = await actions.voidAttemptAction(
      form({ attemptId, reason: 'Customer walked away' }),
    )
    expect(voided.ok).toBe(true)
    const [row] = await handle.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, attemptId))
    expect(row?.state).toBe('voided')
  })

  it('void action as staff is forbidden', async () => {
    const { attemptId } = await makeCardAttempt(handle.db, trade)
    const r = await actions.voidAttemptAction(form({ attemptId, reason: 'Customer walked away' }))
    expect(r).toEqual({ ok: false, error: 'You do not have permission to do this.' })
  })

  it('check with processor on an attempt with no processor object changes nothing', async () => {
    const { attemptId } = await makeCardAttempt(handle.db, trade)
    const r = await actions.checkWithProcessorAction(form({ attemptId }))
    expect(r.ok).toBe(true)
    const [row] = await handle.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, attemptId))
    expect(row?.state).toBe('pending')
  })
})
