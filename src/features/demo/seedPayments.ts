import { and, eq, like } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { ledgerEntries, paymentAttempts, projects } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { publishConfig } from '@/features/config/publish'
import { saveDraft } from '@/features/config/store'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { PAYMENT_SETTINGS_SEED } from '@/features/demo/paymentSettingsSeed'
import { storyDay } from '@/features/demo/seedCalendar'
import {
  actorFor,
  type Cast,
  must,
  noon,
  open,
  type Scenario,
  TITLE_PREFIX,
} from '@/features/demo/seedPermitSupport'
import { allocateToDueLines, feeBalance } from '@/features/ledger/feeBalance'
import { recordReturnedCheck, refundEntry } from '@/features/ledger/reversals'
import { saveProcessorAccount } from '@/features/payments/processorAccounts'
import { resolveSimulatedReader, startCardPresentPayment } from '@/features/payments/startPayment'
import type { CivilDate } from '@/types/civilDate'

export const DEMO_PAYMENT_DAY = '2026-10-28'
const REFUND_DAY = '2026-10-29'
const RETURNED_DAY = '2026-10-30'

export function demoPaymentDate(): CivilDate {
  return storyDay(DEMO_PAYMENT_DAY)
}
const PAYMENT_PREFIX = 'Payments:'
const REFUND_CENTS = 1000
const SIMULATED_WEBHOOK_SECRET = 'demo-simulated-webhook-secret'

const TRADE_BASE = { description: 'Demo trade work' }

async function dueAllocations(db: Db, applicationId: string, signal: AbortSignal) {
  const balance = await feeBalance(db, applicationId, signal)
  return allocateToDueLines(applicationId, balance, balance.dueCents)
}

async function configurePayments(db: Db, cast: Cast, signal: AbortSignal): Promise<void> {
  const saved = must(
    await saveDraft(
      db,
      cast.admin,
      { kind: 'payment_settings', key: 'default', body: PAYMENT_SETTINGS_SEED },
      signal,
    ),
    'payment settings draft',
  )
  must(await publishConfig(db, cast.admin, saved.versionId, signal), 'payment settings publish')
  must(
    await saveProcessorAccount(
      db,
      cast.admin,
      {
        processor: 'simulated',
        mode: 'test',
        accountRef: 'sim_town',
        settings: {},
        credentials: {},
        webhookSecret: SIMULATED_WEBHOOK_SECRET,
      },
      signal,
      { simulatedEnabled: true },
    ),
    'simulated processor account',
  )
}

export async function payByCard(
  db: Db,
  staff: Actor,
  input: { applicationId: string; payerName: string },
  signal: AbortSignal,
  now: Date,
): Promise<string> {
  const started = must(
    await startCardPresentPayment(
      db,
      staff,
      { applicationIds: [input.applicationId], payerName: input.payerName },
      signal,
      { now },
    ),
    'card start',
  )
  must(
    await resolveSimulatedReader(
      db,
      staff,
      { attemptId: started.attemptId, outcome: 'captured' },
      signal,
      { now },
    ),
    'card capture',
  )
  return started.attemptId
}

export async function payByCheck(
  db: Db,
  staff: Actor,
  input: { applicationId: string; payerName: string; checkNumber: string },
  signal: AbortSignal,
  now: Date,
): Promise<string> {
  const allocations = await dueAllocations(db, input.applicationId, signal)
  const paid = must(
    await recordCounterPayment(
      db,
      staff,
      {
        method: 'check',
        amountCents: allocations.reduce((s, a) => s + a.amountCents, 0),
        checkNumber: input.checkNumber,
        payerName: input.payerName,
        allocations,
      },
      signal,
      now,
    ),
    'check payment',
  )
  return paid.entryId
}

async function cardPermit(
  db: Db,
  cast: Cast,
  finance: Cast['staff'],
  scenario: Scenario,
  signal: AbortSignal,
): Promise<void> {
  const attemptId = await payByCard(
    db,
    cast.staff,
    { applicationId: scenario.applicationId, payerName: 'Demo plumber' },
    signal,
    noon(demoPaymentDate()),
  )
  await scenario.step('issued', demoPaymentDate())
  const [payment] = await db
    .select()
    .from(ledgerEntries)
    .where(
      and(eq(ledgerEntries.paymentAttemptId, attemptId), eq(ledgerEntries.entryType, 'payment')),
    )
  must(
    await refundEntry(
      db,
      finance,
      {
        entryId: payment?.id ?? '',
        amountCents: REFUND_CENTS,
        reason: 'Fixture count reduced after inspection',
      },
      signal,
      { now: noon(storyDay(REFUND_DAY)) },
    ),
    'card refund',
  )
}

async function checkPermit(
  db: Db,
  cast: Cast,
  finance: Cast['staff'],
  scenario: Scenario,
  signal: AbortSignal,
): Promise<void> {
  const entryId = await payByCheck(
    db,
    cast.staff,
    { applicationId: scenario.applicationId, payerName: 'Demo electrician', checkNumber: '1048' },
    signal,
    noon(demoPaymentDate()),
  )
  await scenario.step('issued', demoPaymentDate())
  must(
    await recordReturnedCheck(
      db,
      finance,
      {
        entryId,
        reason: 'Insufficient funds notice from the bank',
        returnedOn: storyDay(RETURNED_DAY),
      },
      signal,
      { now: noon(storyDay(RETURNED_DAY)) },
    ),
    'returned check',
  )
}

export async function seedPayments(db: Db, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted()
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(like(projects.title, `${TITLE_PREFIX} ${PAYMENT_PREFIX}%`))
    .limit(1)
  if (existing.length > 0) return false
  const cast: Cast = {
    admin: await actorFor(db, 'admin', signal),
    staff: await actorFor(db, 'staff', signal),
    applicant: await actorFor(db, 'applicant', signal),
  }
  const finance = await actorFor(db, 'finance', signal)
  await configurePayments(db, cast, signal)
  const trade = (parcel: string, title: string, typeKey: string, license: string, extra = {}) =>
    open(db, cast, signal, {
      parcel,
      title: `${PAYMENT_PREFIX} ${title}`,
      typeKey,
      values: { ...TRADE_BASE, contractor_license_number: license, ...extra },
      submittedOn: storyDay('2026-10-26'),
    })

  const cash = await trade('007008000000', 'Gas line paid in cash', 'MG', 'MG-11802')
  await cash.step('issued', demoPaymentDate())
  await cardPermit(
    db,
    cast,
    finance,
    await trade('007009000000', 'Bathroom paid by simulated card', 'PL', 'PL-30211', {
      fixture_count: 4,
    }),
    signal,
  )
  await checkPermit(
    db,
    cast,
    finance,
    await trade('007010000000', 'Subpanel paid by check', 'EL', 'EL-20418'),
    signal,
  )

  const waiting = await trade('007011000000', 'Reader lost connection', 'PL', 'PL-30211')
  const started = must(
    await startCardPresentPayment(
      db,
      cast.staff,
      { applicationIds: [waiting.applicationId], payerName: 'Demo plumber' },
      signal,
      { now: noon(demoPaymentDate()) },
    ),
    'unknown start',
  )
  must(
    await resolveSimulatedReader(
      db,
      cast.staff,
      { attemptId: started.attemptId, outcome: 'unknown' },
      signal,
    ),
    'unknown outcome',
  )
  const [attempt] = await db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, started.attemptId))
  return attempt?.outcomeUnknown === true
}
