import type { FeeComputation, FeeLineResult } from '@/features/fees/computeFees'
import { formatCents } from '@/lib/money'

function amountText(line: FeeLineResult): string {
  const { amount } = line
  if ('pending' in amount) return `Pending: ${amount.pending}`
  if (amount.source === 'manual_override' && amount.replaced !== null) {
    return amount.value === 0
      ? `Waived (was ${formatCents(amount.replaced.value)})`
      : `${formatCents(amount.value)} (was ${formatCents(amount.replaced.value)})`
  }
  return formatCents(amount.value)
}

export function FeeTable({ title, computation }: { title: string; computation: FeeComputation }) {
  return (
    <section aria-label={title} className="my-3">
      <h3 className="text-base font-semibold">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1">Fee</th>
            <th>Amount</th>
            <th>How it was worked out</th>
          </tr>
        </thead>
        <tbody>
          {computation.lines.map((line) => (
            <tr key={line.code} className="border-b align-top">
              <td className="py-1">{line.label}</td>
              <td>{amountText(line)}</td>
              <td>
                {line.explanation.map((step) => (
                  <p key={step} className="m-0">
                    {step}
                  </p>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th className="py-1 text-left">Total</th>
            <td colSpan={2}>
              {computation.totalCents === null
                ? 'Total not yet known'
                : formatCents(computation.totalCents)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}
