import { and, eq, like } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { ledgerEntries, paymentAttempts, projects } from '@/db/schema'
import { publishConfig } from '@/features/config/publish'
import { saveDraft } from '@/features/config/store'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { PAYMENT_SETTINGS_SEED } from '@/features/demo/paymentSettingsSeed'
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

export const DEMO_PAYMENT_DATE = '2026-06-01' as CivilDate
const REFUND_DATE = '2026-06-02'
const RETURNED_DATE = '2026-06-03'
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

async function cardPermit(
  db: Db,
  cast: Cast,
  finance: Cast['staff'],
  scenario: Scenario,
  signal: AbortSignal,
): Promise<void> {
  const started = must(
    await startCardPresentPayment(
      db,
      cast.staff,
      { applicationIds: [scenario.applicationId], payerName: 'Demo plumber' },
      signal,
      { now: noon(DEMO_PAYMENT_DATE) },
    ),
    'card start',
  )
  must(
    await resolveSimulatedReader(
      db,
      cast.staff,
      { attemptId: started.attemptId, outcome: 'captured' },
      signal,
      { now: noon(DEMO_PAYMENT_DATE) },
    ),
    'card capture',
  )
  await scenario.step('issued', DEMO_PAYMENT_DATE)
  const [payment] = await db
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.paymentAttemptId, started.attemptId),
        eq(ledgerEntries.entryType, 'payment'),
      ),
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
      { now: noon(REFUND_DATE) },
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
  const paid = must(
    await recordCounterPayment(
      db,
      cast.staff,
      {
        method: 'check',
        amountCents: (await dueAllocations(db, scenario.applicationId, signal)).reduce(
          (s, a) => s + a.amountCents,
          0,
        ),
        checkNumber: '1048',
        payerName: 'Demo electrician',
        allocations: await dueAllocations(db, scenario.applicationId, signal),
      },
      signal,
      noon(DEMO_PAYMENT_DATE),
    ),
    'check payment',
  )
  await scenario.step('issued', DEMO_PAYMENT_DATE)
  must(
    await recordReturnedCheck(
      db,
      finance,
      {
        entryId: paid.entryId,
        reason: 'Insufficient funds notice from the bank',
        returnedOn: RETURNED_DATE as CivilDate,
      },
      signal,
      { now: noon(RETURNED_DATE) },
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
      submittedOn: '2026-05-30',
    })

  const cash = await trade('007008000000', 'Gas line paid in cash', 'MG', 'MG-11802')
  await cash.step('issued', DEMO_PAYMENT_DATE)
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
      { now: noon(DEMO_PAYMENT_DATE) },
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
