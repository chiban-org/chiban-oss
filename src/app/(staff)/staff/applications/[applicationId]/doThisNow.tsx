import { DoThisNowCard } from '@/components/layout/WorkPlan'
import type { WorkPlan } from '@/features/applications/workPlanTypes'
import { PlanActionForm, type PlanFormInput } from './planActionForm'

export function DoThisNow({ plan, input }: { plan: WorkPlan; input: PlanFormInput }) {
  const { now } = plan
  if (now === null) return null
  return (
    <DoThisNowCard task={now.task} note={now.note} warnings={now.warnings}>
      {now.action === null ? null : <PlanActionForm action={now.action} input={input} primary />}
      {now.secondary.map((action) => (
        <PlanActionForm
          key={action.kind === 'move' ? action.to : action.kind}
          action={action}
          input={input}
          primary={false}
        />
      ))}
    </DoThisNowCard>
  )
}
