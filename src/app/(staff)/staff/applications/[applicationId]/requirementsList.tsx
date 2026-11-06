import { CircleCheck, CircleX } from 'lucide-react'
import type { Requirement, WorkPlan } from '@/features/applications/workPlanTypes'
import { GateControls } from './gateControls'
import { actionSummary, PlanActionForm, type PlanFormInput } from './planActionForm'

function StatusMark({ done }: { done: boolean }) {
  const Icon = done ? CircleCheck : CircleX
  return (
    <>
      <Icon
        className={`mt-0.5 size-4 shrink-0 ${done ? 'text-status-passed-fg' : 'text-status-failed-fg'}`}
        aria-hidden={true}
      />
      <span className="sr-only">{done ? 'Done: ' : 'Not done: '}</span>
    </>
  )
}

function OverrideNote({ row }: { row: Requirement }) {
  const override = row.gate?.override ?? null
  if (override === null) return null
  if (override.kind === 'statutory_exception') {
    const authority = override.legalAuthority as { citation: string; explanation: string } | null
    return (
      <p className="text-sm">{`Statutory exception: ${authority?.citation ?? ''}. ${authority?.explanation ?? ''}`}</p>
    )
  }
  return <p className="text-sm">{`Overridden: ${override.reason ?? ''}`}</p>
}

function RowAction({
  row,
  inCard,
  input,
}: {
  row: Requirement
  inCard: boolean
  input: PlanFormInput
}) {
  if (row.done) return null
  if (inCard) return <p className="text-sm text-muted-foreground">The form is in Do this now.</p>
  if (row.action === null) return null
  return (
    <details>
      <summary className="text-sm">{actionSummary(row.action, input)}</summary>
      <PlanActionForm action={row.action} input={input} primary={false} />
    </details>
  )
}

function RequirementItem({
  row,
  inCard,
  input,
}: {
  row: Requirement
  inCard: boolean
  input: PlanFormInput
}) {
  return (
    <li className="record-item flex flex-col gap-2 pb-3 [&>*]:m-0">
      <p className="flex items-start gap-2">
        <StatusMark done={row.done} />
        {row.done ? (
          <span>{row.label}</span>
        ) : (
          <a href={`#${row.anchor}`} className="font-semibold">
            {row.label}
          </a>
        )}
      </p>
      {row.detail === '' ? null : <p className="pl-6 text-sm text-ink-secondary">{row.detail}</p>}
      <div className="flex flex-col gap-2 pl-6 empty:hidden">
        <OverrideNote row={row} />
        <RowAction row={row} inCard={inCard} input={input} />
        {row.gate === null ? null : <GateControls view={input.view} result={row.gate} />}
      </div>
    </li>
  )
}

export function RequirementsList({ plan, input }: { plan: WorkPlan; input: PlanFormInput }) {
  if (plan.groups.length === 0) return null
  return (
    <section aria-label="Requirements" id="requirements">
      <h2>Requirements</h2>
      {plan.groups.map((group) => (
        <section key={group.to} aria-label={group.title}>
          <h3>{group.title}</h3>
          <ul aria-label={group.title} className="flex list-none flex-col gap-3 p-0">
            {group.rows.map((row) => (
              <RequirementItem
                key={row.key}
                row={row}
                inCard={plan.now?.key === row.key && plan.now.action !== null}
                input={input}
              />
            ))}
          </ul>
        </section>
      ))}
    </section>
  )
}
