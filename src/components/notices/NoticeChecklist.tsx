import { StatusChip } from '@/components/StatusChip'
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

const STATE_ORDER: Record<ChecklistItem['state'], number> = {
  missing: 0,
  proved_late: 1,
  proved_on_time: 2,
}

function proofText(proof: NonNullable<ChecklistItem['proof']>): string {
  const reference = proof.reference === null ? '' : `, ${proof.reference}`
  return `${proof.method}${reference}, ${proof.effectiveOn}`
}

function sharedDue(items: readonly ChecklistItem[]): string | null {
  const first = items[0]?.dueOn
  return first !== undefined && items.every((i) => i.dueOn === first) ? first : null
}

export function provedSummary(count: number, noticedOn: string | null): string {
  const head = count === 1 ? 'The notice was proved on time' : `All ${count} notices proved on time`
  return noticedOn === null ? head : `${head}, marked noticed ${noticedOn}`
}

function ChecklistTable({ items, showDue }: { items: ChecklistItem[]; showDue: boolean }) {
  return (
    <div className="table-panel">
      <table className="w-full min-w-[36rem] text-sm">
        <caption className="sr-only">Notice items and their proof</caption>
        <thead>
          <tr className="text-left">
            <th scope="col">Notice</th>
            <th scope="col">Recipient</th>
            {showDue ? <th scope="col">Due</th> : null}
            <th scope="col">Proof</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.itemId} className="align-top">
              <td>{item.channel}</td>
              <td>
                {item.recipientName ?? 'Not named'}
                {item.recipientAddress === null ? null : (
                  <span className="block text-muted-foreground">{item.recipientAddress}</span>
                )}
              </td>
              {showDue ? <td>{item.dueOn}</td> : null}
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
    </div>
  )
}

export function NoticeChecklist({
  items,
  noticedOn,
}: {
  items: ChecklistItem[]
  noticedOn: string | null
}) {
  if (items.length === 0) {
    return <p>No notices are listed yet.</p>
  }
  const due = sharedDue(items)
  const ordered = [...items].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state])
  const table = <ChecklistTable items={ordered} showDue={due === null} />
  if (items.every((i) => i.state === 'proved_on_time')) {
    return (
      <details aria-label="Notice checklist">
        <summary>{provedSummary(items.length, noticedOn)}</summary>
        <div className="mt-3">{table}</div>
      </details>
    )
  }
  return (
    <section aria-label="Notice checklist">
      {due === null ? null : <p>{`All due ${due}.`}</p>}
      {table}
      {noticedOn === null ? null : <p>{`Marked properly noticed on ${noticedOn}.`}</p>}
    </section>
  )
}
