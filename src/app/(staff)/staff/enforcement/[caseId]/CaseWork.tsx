import { StageStrip } from '@/components/layout/StageStrip'
import { DoThisNowCard, RequirementItem, RequirementsPanel } from '@/components/layout/WorkPlan'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { caseStages } from '@/features/enforcement/stageStrip'
import type { CaseWorkPlan } from '@/features/enforcement/workPlanTypes'
import { CasePlanForm } from './CasePlanForm'

function stageInput(detail: CaseDetail, plan: CaseWorkPlan) {
  return {
    status: plan.status,
    stayed: plan.stayed,
    violationFound: detail.findings.length > 0,
    orderIssued: detail.orders.some((o) => o.row.issuedOn !== null),
    inCourt: detail.orders.some((o) => o.steps.length > 0),
    overdue: plan.due !== null && plan.due.daysLeft < 0,
  }
}

export function CaseSummary({ detail, plan }: { detail: CaseDetail; plan: CaseWorkPlan }) {
  return (
    <div className="flex flex-col gap-3">
      <p data-slot="status-sentence" className="max-w-[75ch]">
        {plan.sentence}
      </p>
      <StageStrip stages={caseStages(stageInput(detail, plan))} />
    </div>
  )
}

export function CaseDoThisNow({ detail, plan }: { detail: CaseDetail; plan: CaseWorkPlan }) {
  const { now } = plan
  if (now === null) return null
  return (
    <DoThisNowCard task={now.task} note={now.note} warnings={now.warnings}>
      {now.action === null ? null : (
        <CasePlanForm key={JSON.stringify(now.action)} action={now.action} detail={detail} />
      )}
    </DoThisNowCard>
  )
}

export function CaseRequirements({ plan }: { plan: CaseWorkPlan }) {
  const inCard = plan.now?.action == null ? null : plan.now.key
  const groups = plan.groups.map((group) => ({
    key: group.key,
    title: group.title,
    items: group.rows.map((row) => (
      <RequirementItem
        key={row.key}
        done={row.done}
        label={row.label}
        anchor={row.anchor}
        detail={row.detail}
      >
        {!row.done && row.key === inCard ? (
          <p className="text-sm text-muted-foreground">The form is in Do this now.</p>
        ) : null}
      </RequirementItem>
    )),
  }))
  return <RequirementsPanel groups={groups} />
}
