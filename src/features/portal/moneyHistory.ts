import type { PortalMoneyEntry } from '@/features/portal/portalView'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'

const PAID_BY = new Map([
  ['cash', 'in cash'],
  ['check', 'by check'],
  ['card_present', 'by card at the counter'],
  ['card_online', 'by card online'],
])

function paidBy(entry: PortalMoneyEntry): string {
  if (entry.method === 'check' && entry.checkNumber !== null) return `by check ${entry.checkNumber}`
  return PAID_BY.get(entry.method) ?? `by ${entry.method.replaceAll('_', ' ')}`
}

function body(entry: PortalMoneyEntry): string {
  const amount = formatCents(Math.abs(entry.amountCents))
  const convenience = formatCents(Math.abs(entry.convenienceCents))
  switch (entry.entryType) {
    case 'payment':
      return entry.convenienceCents === 0
        ? `paid ${amount} ${paidBy(entry)}.`
        : `paid ${amount} ${paidBy(entry)}, including a ${convenience} card convenience fee.`
    case 'refund': {
      const to = entry.method.startsWith('card') ? 'to the card' : 'to the payer'
      return entry.convenienceCents === 0
        ? `refunded ${amount} ${to}.`
        : `refunded ${amount} ${to}, including ${convenience} of the card convenience fee.`
    }
    case 'returned_check': {
      const check = entry.checkNumber === null ? 'a check' : `check ${entry.checkNumber}`
      return `${check} for ${amount} was returned by the bank, so it no longer counts as paid.`
    }
    case 'chargeback':
      return `the card payment of ${amount} was disputed, so it no longer counts as paid.`
    default:
      return `the town moved ${amount} of a payment ${entry.amountCents < 0 ? 'off' : 'onto'} this application.`
  }
}

export function moneyEntrySentence(entry: PortalMoneyEntry): string {
  return `${formatCivilDate(entry.date)}: ${body(entry)}`
}
