import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import type { LotDecision } from '@/features/parcels/lotConditions'
import type { RecordRow } from '@/features/parcels/recordTable'
import { formatCivilDate } from '@/lib/formatDate'

function datesLine(decision: LotDecision): string {
  const decided =
    decision.decidedOn === null
      ? []
      : [
          `${decision.kind === 'permit' ? 'Issued' : 'Decided'} ${formatCivilDate(decision.decidedOn)}.`,
        ]
  const expires = decision.expires === null ? [] : [`Expires ${formatCivilDate(decision.expires)}.`]
  return [...decided, ...expires].join(' ')
}

function Decision({ decision, row }: { decision: LotDecision; row: RecordRow | undefined }) {
  const href = row?.href ?? null
  const line = datesLine(decision)
  return (
    <li className="record-item flex flex-col gap-2 [&>*]:m-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {href === null ? (
          <span className="font-semibold">{decision.number}</span>
        ) : (
          <Link href={href} className="font-semibold">
            {decision.number}
          </Link>
        )}
        {row === undefined ? null : <span>{row.typeLabel}</span>}
        <StatusChip status={decision.outcome.chip} label={decision.outcome.label} />
      </div>
      {line === '' ? null : <p className="text-sm text-muted-foreground">{line}</p>}
      {decision.conditions.length === 0 ? (
        <p className="text-sm">No conditions.</p>
      ) : (
        <ol
          aria-label={`Conditions on ${decision.number}`}
          className="m-0 flex flex-col gap-1 pl-5"
        >
          {decision.conditions.map((c) => (
            <li key={c.code}>
              <span className="font-semibold">{`${c.code}: `}</span>
              {c.text}
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}

export function ConditionsInForce({
  decisions,
  rows,
}: {
  decisions: readonly LotDecision[]
  rows: readonly RecordRow[]
}) {
  return (
    <section id="conditions" aria-labelledby="conditions-heading">
      <h2 id="conditions-heading">Conditions and decisions in force</h2>
      {decisions.length === 0 ? (
        <p>No conditions or board decisions are in force on this lot.</p>
      ) : (
        <ul className="list-none p-0">
          {decisions.map((d) => (
            <Decision
              key={d.applicationId}
              decision={d}
              row={rows.find((r) => r.kind === 'application' && r.recordId === d.applicationId)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
