import { eq, sql } from 'drizzle-orm'
import { ledgerAllocations } from '@/db/schema'
import { rangeCountsOn } from '@/features/payments/entryList'
import { PAYMENTS_PATH as PAYMENTS } from '@/features/payments/entryListParams'
import { countFlagged } from '@/features/payments/flaggedAttempts'
import { PAYMENT_ALERT_IDS } from '@/features/payments/paymentAlertIds'
import { countWorkQueue } from '@/features/queue/workQueue'
import type { HomeContext, HomeLink, HomeRow, HomeSection } from '@/features/staffHome/homeTypes'
import { mayOpen } from '@/features/staffNav/navItems'

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
  const [unknown, anomalies, fees, ranges, overpaid] = await Promise.all([
    countFlagged(ctx.db, 'unknown', ctx.signal),
    countFlagged(ctx.db, 'anomalies', ctx.signal),
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
    key: 'payments',
    title: 'Payments',
    urgency: unknown + anomalies,
    rows: [
      {
        label: 'Card payments with an unknown outcome',
        count: unknown,
        href: `${PAYMENTS}#${PAYMENT_ALERT_IDS.unknown}`,
      },
      {
        label: 'Card payments with an anomaly',
        count: anomalies,
        href: `${PAYMENTS}#${PAYMENT_ALERT_IDS.anomalies}`,
      },
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
