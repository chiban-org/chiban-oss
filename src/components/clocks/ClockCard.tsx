import { StatusChip } from '@/components/StatusChip'
import type { ClockExplanation } from '@/features/clocks/explainClock'
import { formatCivilDate } from '@/lib/formatDate'

const WHOSE: Record<ClockExplanation['whose'], string> = {
  official: 'Municipal official',
  board: 'Board',
  applicant: 'Applicant',
  third_party: 'Third party',
}

const KIND_LABEL: Record<string, string> = {
  extension: 'Extension',
  waiver: 'Waiver',
  renewal: 'Renewal',
  tolling: 'Tolling',
  statutory_exception: 'Statutory exception',
}

function plural(n: number): string {
  return n === 1 ? 'day' : 'days'
}

function statusChip(clock: ClockExplanation) {
  const days = Math.abs(clock.daysRemaining)
  switch (clock.status) {
    case 'overdue':
      return <StatusChip status="overdue" label={`Overdue by ${days} ${plural(days)}`} />
    case 'met':
      return <StatusChip status="passed" label="Met" />
    case 'lapsed':
      return <StatusChip status="failed" label="Lapsed" />
    case 'superseded':
      return <StatusChip status="neutral" label="Superseded by a rule change" />
    case 'stopped':
      return <StatusChip status="neutral" label="Stopped" />
    case 'running':
      return (
        <StatusChip
          status={clock.daysRemaining < 0 ? 'overdue' : 'neutral'}
          label={
            clock.daysRemaining < 0
              ? `Past due by ${days} ${plural(days)}`
              : `${days} ${plural(days)} remaining`
          }
        />
      )
  }
}

function dueNote(clock: ClockExplanation): string | null {
  const { source, replaced } = clock.currentDue
  if (source === 'manual_override' && replaced !== null)
    return `Adjusted from ${formatCivilDate(replaced.value)}.`
  if (source === 'town_setting' && replaced !== null) {
    return `Town setting. The pack default would be ${formatCivilDate(replaced.value)}.`
  }
  if (source === 'town_setting') return 'Town setting.'
  return null
}

export function ClockCard({ clock }: { clock: ClockExplanation & { clockId: string } }) {
  const note = dueNote(clock)
  return (
    <article className="my-3 rounded-lg border bg-surface p-4" aria-label={clock.ruleLabel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{clock.ruleLabel}</h3>
        {statusChip(clock)}
      </div>
      <p className="text-sm text-muted-foreground">
        {`Rule ${clock.ruleKey} version ${clock.ruleVersion}, pack ${clock.packVersion}. `}
        {clock.citation.url === null ? (
          clock.citation.label
        ) : (
          <a href={clock.citation.url} className="text-action underline">
            {clock.citation.label}
          </a>
        )}
      </p>
      <dl className="mt-2 grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="font-medium">Starts</dt>
        <dd>{`${clock.startEvent} on ${formatCivilDate(clock.startDate)}`}</dd>
        <dt className="font-medium">Counting</dt>
        <dd>{clock.countingMethod}</dd>
        <dt className="font-medium">Due</dt>
        <dd>
          <strong>{formatCivilDate(clock.currentDue.value)}</strong>
          {note === null ? null : ` ${note}`}
          {clock.rolledFrom === null ? null : ` Rolled forward from ${clock.rolledFrom}.`}
        </dd>
        <dt className="font-medium">Who acts</dt>
        <dd>{WHOSE[clock.whose]}</dd>
        <dt className="font-medium">If missed</dt>
        <dd>{clock.consequence}</dd>
        <dt className="font-medium">Extension</dt>
        <dd>{clock.extensionPolicy}</dd>
      </dl>
      {clock.adjustments.length === 0 ? null : (
        <ul className="mt-2 list-disc pl-5 text-sm">
          {clock.adjustments.map((a) => (
            <li key={`${a.kind}-${a.at.toISOString()}`}>
              {`${KIND_LABEL[a.kind] ?? a.kind}${a.days === null ? '' : `, ${a.days} ${plural(a.days)}`}${a.newDue === null ? '' : `, new due date ${formatCivilDate(a.newDue)}`}. ${a.reason}`}
              {a.legalAuthority === null
                ? null
                : ` Authority: ${a.legalAuthority.citation}. ${a.legalAuthority.explanation}`}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
