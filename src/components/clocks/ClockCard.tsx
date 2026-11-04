import type { ReactNode } from 'react'
import { StatusChip } from '@/components/StatusChip'
import { adjustmentKindLabel } from '@/features/clocks/adjustmentKinds'
import type { ClockExplanation } from '@/features/clocks/explainClock'
import { formatCivilDate, humanizeIsoDates } from '@/lib/formatDate'
import { daysBetween } from '@/types/civilDate'

const WHOSE: Record<ClockExplanation['whose'], string> = {
  official: 'Municipal official',
  board: 'Board',
  applicant: 'Applicant',
  third_party: 'Third party',
}

function plural(n: number): string {
  return n === 1 ? 'day' : 'days'
}

function metChip(clock: ClockExplanation) {
  const late = clock.metOn === null ? 0 : daysBetween(clock.currentDue.value, clock.metOn)
  return late > 0 ? (
    <StatusChip status="overdue" label={`Met late, ${late} ${plural(late)} after the due date`} />
  ) : (
    <StatusChip status="passed" label="Met" />
  )
}

function statusChip(clock: ClockExplanation) {
  const days = Math.abs(clock.daysRemaining)
  switch (clock.status) {
    case 'overdue':
      return <StatusChip status="overdue" label={`Overdue by ${days} ${plural(days)}`} />
    case 'met':
      return metChip(clock)
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

const COLLAPSED: readonly ClockExplanation['status'][] = ['met', 'stopped', 'superseded']

type ClockProps = { clock: ClockExplanation & { clockId: string } }

type CardProps = ClockProps & { collapsed?: boolean; children?: ReactNode }

function Citation({ clock }: ClockProps) {
  return clock.citation.url === null ? (
    clock.citation.label
  ) : (
    <a href={clock.citation.url} className="text-action underline">
      {clock.citation.label}
    </a>
  )
}

function ClockDetails({ clock }: ClockProps) {
  const note = dueNote(clock)
  return (
    <>
      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="font-medium">Starts</dt>
        <dd>{`${clock.startEvent} on ${formatCivilDate(clock.startDate)}`}</dd>
        <dt className="font-medium">Counting</dt>
        <dd>{humanizeIsoDates(clock.countingMethod)}</dd>
        <dt className="font-medium">Due</dt>
        <dd>
          <strong>{formatCivilDate(clock.currentDue.value)}</strong>
          {note === null ? null : ` ${note}`}
          {clock.rolledFrom === null
            ? null
            : ` Rolled forward from ${formatCivilDate(clock.rolledFrom)}.`}
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
              {`${adjustmentKindLabel(a.kind)}${a.days === null ? '' : `, ${a.days} ${plural(a.days)}`}${a.newDue === null ? '' : `, new due date ${formatCivilDate(a.newDue)}`}. ${a.reason}`}
              {a.legalAuthority === null
                ? null
                : ` Authority: ${a.legalAuthority.citation}. ${a.legalAuthority.explanation}`}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function CollapsedClock({ clock, children }: CardProps) {
  return (
    <article className="py-2" aria-label={clock.ruleLabel} data-collapsed="">
      <details>
        <summary className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 font-normal text-ink">
          <span className="font-semibold">{clock.ruleLabel}</span>
          {statusChip(clock)}
          <span className="text-sm text-muted-foreground">
            {`Due ${formatCivilDate(clock.currentDue.value)}`}
          </span>
        </summary>
        <p className="m-0 text-sm text-muted-foreground">
          <Citation clock={clock} />
        </p>
        <ClockDetails clock={clock} />
        {children}
      </details>
    </article>
  )
}

export function ClockCard({ clock, collapsed = false, children }: CardProps) {
  if (collapsed || COLLAPSED.includes(clock.status)) {
    return <CollapsedClock clock={clock}>{children}</CollapsedClock>
  }
  return (
    <article className="py-2" aria-label={clock.ruleLabel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{clock.ruleLabel}</h3>
        {statusChip(clock)}
      </div>
      <p className="text-sm text-muted-foreground">
        <Citation clock={clock} />
      </p>
      <ClockDetails clock={clock} />
      {children}
    </article>
  )
}
