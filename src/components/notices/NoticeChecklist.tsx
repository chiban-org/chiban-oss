import type { ReactNode } from 'react'
import { StatusChip } from '@/components/StatusChip'
import { Button } from '@/components/ui/button'
import type { Status } from '@/features/design/tokens'

export interface ChecklistItem {
  itemId: string
  channel: string
  recipientName: string | null
  recipientAddress: string | null
  dueOn: string
  proof: { method: string; reference: string | null; effectiveOn: string } | null
  state: 'proved_on_time' | 'proved_late' | 'missing'
}

const STATE_CHIP: Record<ChecklistItem['state'], { status: Status; label: string }> = {
  proved_on_time: { status: 'passed', label: 'On time' },
  proved_late: { status: 'overdue', label: 'Late' },
  missing: { status: 'failed', label: 'Missing' },
}

function proofText(proof: NonNullable<ChecklistItem['proof']>): string {
  const reference = proof.reference === null ? '' : `, ${proof.reference}`
  return `${proof.method}${reference}, ${proof.effectiveOn}`
}

function outstandingText(count: number): string {
  return count === 1
    ? '1 item still needs timely proof.'
    : `${count} items still need timely proof.`
}

export function NoticeChecklist({
  items,
  noticedOn,
  markSlot,
  showMark = true,
}: {
  items: ChecklistItem[]
  noticedOn: string | null
  markSlot?: ReactNode
  showMark?: boolean
}) {
  const outstanding = items.filter((i) => i.state !== 'proved_on_time').length
  return (
    <section aria-label="Notice checklist" className="space-y-3">
      <table className="w-full text-sm">
        <caption className="sr-only">Notice items and their proof</caption>
        <thead>
          <tr className="border-b text-left">
            <th scope="col" className="py-2">
              Notice
            </th>
            <th scope="col">Recipient</th>
            <th scope="col">Due</th>
            <th scope="col">Proof</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.itemId} className="border-b align-top">
              <td className="py-2">{item.channel}</td>
              <td>
                {item.recipientName ?? 'Not named'}
                {item.recipientAddress === null ? null : (
                  <span className="block text-muted-foreground">{item.recipientAddress}</span>
                )}
              </td>
              <td>{item.dueOn}</td>
              <td>{item.proof === null ? 'No proof yet' : proofText(item.proof)}</td>
              <td>
                <StatusChip
                  status={STATE_CHIP[item.state].status}
                  label={STATE_CHIP[item.state].label}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {noticedOn === null ? null : <p>{`Marked properly noticed on ${noticedOn}.`}</p>}
      {!showMark || noticedOn !== null || items.length === 0 ? null : outstanding === 0 ? (
        markSlot
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled>
            Mark properly noticed
          </Button>
          <p className="m-0">{outstandingText(outstanding)}</p>
        </div>
      )}
    </section>
  )
}
