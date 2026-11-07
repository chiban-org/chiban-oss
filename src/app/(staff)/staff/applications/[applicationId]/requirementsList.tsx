import { RequirementItem, RequirementsPanel } from '@/components/layout/WorkPlan'
import type { Requirement, WorkPlan } from '@/features/applications/workPlanTypes'
import { GateControls } from './gateControls'
import { actionSummary, PlanActionForm, type PlanFormInput } from './planActionForm'

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

function PlanRequirement({
  row,
  inCard,
  input,
}: {
  row: Requirement
  inCard: boolean
  input: PlanFormInput
}) {
  return (
    <RequirementItem done={row.done} label={row.label} anchor={row.anchor} detail={row.detail}>
      <OverrideNote row={row} />
      <RowAction row={row} inCard={inCard} input={input} />
      {row.gate === null ? null : <GateControls view={input.view} result={row.gate} />}
    </RequirementItem>
  )
}

export function RequirementsList({ plan, input }: { plan: WorkPlan; input: PlanFormInput }) {
  const groups = plan.groups.map((group) => ({
    key: group.to,
    title: group.title,
    items: group.rows.map((row) => (
      <PlanRequirement
        key={row.key}
        row={row}
        inCard={plan.now?.key === row.key && plan.now.action !== null}
        input={input}
      />
    )),
  }))
  return <RequirementsPanel groups={groups} />
}
