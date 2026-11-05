import { count, eq, isNotNull, or, sql } from 'drizzle-orm'
import { ledgerAllocations, paymentAttempts } from '@/db/schema'
import { rangeCountsOn } from '@/features/payments/entryList'
import { countWorkQueue } from '@/features/queue/workQueue'
import type { HomeContext, HomeLink, HomeRow, HomeSection } from '@/features/staffHome/homeTypes'
import { mayOpen } from '@/features/staffNav/navItems'

const PAYMENTS = '/staff/payments'

async function paymentProblems(ctx: HomeContext): Promise<number> {
  const [row] = await ctx.db
    .select({ n: count() })
    .from(paymentAttempts)
    .where(or(eq(paymentAttempts.outcomeUnknown, true), isNotNull(paymentAttempts.anomaly)))
  return row?.n ?? 0
}

async function overpayments(ctx: HomeContext): Promise<number> {
  const rows = await ctx.db
    .select({ applicationId: ledgerAllocations.applicationId })
    .from(ledgerAllocations)
    .where(eq(ledgerAllocations.targetKind, 'overpayment'))
    .groupBy(ledgerAllocations.applicationId)
    .having(sql`sum(${ledgerAllocations.amountCents}) > 0`)
  return rows.filter((r) => r.applicationId !== null).length
}

async function waitingOnFees(ctx: HomeContext): Promise<HomeRow[]> {
  if (!mayOpen('/staff/applications', ctx.viewer)) return []
  const [fees] = await countWorkQueue(
    ctx.db,
    ctx.actor,
    [{ flags: ['fees'] }],
    ctx.today,
    ctx.signal,
  )
  return [
    {
      label: 'Applications waiting on fees',
      count: fees ?? 0,
      href: '/staff/applications?flag=fees',
    },
  ]
}

export async function loadFinanceSection(ctx: HomeContext): Promise<HomeSection | null> {
  if (!mayOpen(PAYMENTS, ctx.viewer)) return null
  ctx.signal.throwIfAborted()
  const [problems, fees, ranges, overpaid] = await Promise.all([
    paymentProblems(ctx),
    waitingOnFees(ctx),
    rangeCountsOn(ctx.db, ctx.today, { types: ['payment'] }),
    overpayments(ctx),
  ])
  const links: HomeLink[] = [{ label: 'Open payments', href: PAYMENTS }]
  if (ctx.viewer.capabilities.has('payment.report')) {
    links.push({
      label: "Today's cash report",
      href: `/staff/reports/cash-receipts?date=${ctx.today}`,
    })
  }
  return {
    role: 'finance',
    title: 'Payments',
    urgency: problems,
    rows: [
      { label: 'Payment problems to sort out', count: problems, href: PAYMENTS },
      ...fees,
      {
        label: 'Receipts today',
        count: ranges.today,
        href: `${PAYMENTS}?range=today&type=payment`,
      },
      { label: 'Overpayments to refund', count: overpaid, href: PAYMENTS },
    ],
    links,
    detail: null,
  }
}
