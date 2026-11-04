import { and, eq, inArray } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { splitPanels } from '@/components/layout/splitPanels'
import { NoPermission } from '@/components/staff/NoPermission'
import type { Db } from '@/db/client'
import {
  applications,
  ledgerEntries,
  paymentAttempts,
  paymentAttemptTransitions,
  processorAccounts,
  receipts,
} from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'
import { transitionSentence } from '@/features/payments/labels'
import { mayViewPayments } from '@/features/payments/overview'
import { getTownSettings } from '@/features/town/settings'
import { formatInstant } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { AttemptRail, isOpen } from './AttemptRail'

export const dynamic = 'force-dynamic'

const PROCESSOR_NAMES = { stripe: 'Stripe', clover: 'Clover' } as const
const MODE_NAMES = { test: 'test mode', live: 'live' } as const

type Account = typeof processorAccounts.$inferSelect

function processorText(account: Account | undefined): string | null {
  if (account === undefined || account.processor === 'simulated') return null
  return `${PROCESSOR_NAMES[account.processor]}, ${MODE_NAMES[account.mode]}`
}

async function attemptReceipt(db: Db, attemptId: string) {
  const [row] = await db
    .select({ id: receipts.id, number: receipts.number })
    .from(ledgerEntries)
    .innerJoin(receipts, eq(receipts.id, ledgerEntries.receiptId))
    .where(
      and(eq(ledgerEntries.paymentAttemptId, attemptId), eq(ledgerEntries.entryType, 'payment')),
    )
    .limit(1)
  return row ?? null
}

async function attemptApplications(db: Db, planned: unknown) {
  const ids = [
    ...new Set(
      (planned as { applicationId?: string }[]).flatMap((a) =>
        a.applicationId === undefined ? [] : [a.applicationId],
      ),
    ),
  ]
  if (ids.length === 0) return []
  return await db
    .select({ id: applications.id, number: applications.number })
    .from(applications)
    .where(inArray(applications.id, ids))
    .orderBy(applications.number)
}

function AmountBreakdown({
  baseCents,
  convenienceFeeCents,
  linked,
}: {
  baseCents: number
  convenienceFeeCents: number
  linked: { id: string; number: string }[]
}) {
  return (
    <section aria-label="Amount">
      <h2>Amount</h2>
      <ul>
        <li>{`Permit fees: ${formatCents(baseCents)}`}</li>
        {convenienceFeeCents > 0 ? (
          <li>
            {`Card convenience fee: ${formatCents(convenienceFeeCents)}, paid by the payer and not town fee revenue`}
          </li>
        ) : null}
      </ul>
      {linked.length === 0 ? null : (
        <p>
          {'For '}
          {linked.map((a, i) => (
            <span key={a.id}>
              {i > 0 ? ', ' : null}
              <Link href={`/staff/applications/${a.id}`} className="text-action underline">
                {a.number}
              </Link>
            </span>
          ))}
        </p>
      )}
    </section>
  )
}

function SimulatedNotice({ checkoutRef }: { checkoutRef: string | null }) {
  return (
    <div role="note" className="rail-card">
      <p>Simulated payment: no card is charged.</p>
      {checkoutRef === null ? null : (
        <p>
          <Link href={`/dev/checkout/${checkoutRef}`} className="text-action underline">
            Open the simulated checkout
          </Link>
        </p>
      )}
    </div>
  )
}

export default async function PaymentAttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>
}) {
  const { attemptId } = await params
  if (!isUuid(attemptId)) notFound()
  const ctx = await requireStaffContext()
  if (!(await mayViewPayments(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Payment" action="view payments" />
  }
  const [attempt] = await ctx.db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, attemptId))
  if (attempt === undefined) notFound()
  const [[account], transitions, linked, receipt, canVoid, canCollect, town] = await Promise.all([
    ctx.db
      .select()
      .from(processorAccounts)
      .where(eq(processorAccounts.id, attempt.processorAccountId)),
    ctx.db
      .select()
      .from(paymentAttemptTransitions)
      .where(eq(paymentAttemptTransitions.attemptId, attempt.id))
      .orderBy(paymentAttemptTransitions.at),
    attemptApplications(ctx.db, attempt.plannedAllocations),
    attemptReceipt(ctx.db, attempt.id),
    hasCapability(ctx.db, ctx.actor.userId, 'payment.refund_void_correct', ctx.signal),
    hasCapability(ctx.db, ctx.actor.userId, 'payment.collect', ctx.signal),
    getTownSettings(ctx.db, ctx.signal),
  ])
  const zone = town.ok ? town.value.timeZone : 'America/New_York'
  const simulated = account?.processor === 'simulated'
  const checkoutRef =
    simulated && attempt.channel === 'card_online' && isOpen(attempt)
      ? attempt.processorObjectId
      : null
  const { filled, empty } = splitPanels([
    {
      empty: false,
      node: (
        <AmountBreakdown
          key="amount"
          baseCents={attempt.baseCents}
          convenienceFeeCents={attempt.convenienceFeeCents}
          linked={linked}
        />
      ),
    },
    {
      empty: transitions.length === 0,
      node: (
        <section key="history" aria-label="History">
          <h2>History</h2>
          {transitions.length === 0 ? <p>No events yet.</p> : null}
          <ul>
            {transitions.map((t) => (
              <li key={t.id}>
                {`${formatInstant(t.at, zone)}: ${transitionSentence(t.fromState, t.toState, t.source)}`}
              </li>
            ))}
          </ul>
        </section>
      ),
    },
  ])
  return (
    <main data-wide="">
      <PageHeader
        kicker="Card payment attempt"
        title={`${formatCents(attempt.amountCents)} from ${attempt.payerName}`}
      />
      <RecordLayout
        rail={
          <>
            <AttemptRail
              attempt={attempt}
              viewer={{ canCheck: canVoid || canCollect, canVoid }}
              links={{ processor: processorText(account), receipt }}
            />
            {simulated ? <SimulatedNotice checkoutRef={checkoutRef} /> : null}
          </>
        }
        {...(empty === undefined ? {} : { empty })}
      >
        {filled}
      </RecordLayout>
    </main>
  )
}
