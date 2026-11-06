import { TriangleAlert } from 'lucide-react'
import type { WorkPlan } from '@/features/applications/workPlanTypes'
import { PlanActionForm, type PlanFormInput } from './planActionForm'

export function DoThisNow({ plan, input }: { plan: WorkPlan; input: PlanFormInput }) {
  const { now } = plan
  if (now === null) return null
  return (
    <section aria-label="Do this now" id="do-this-now" className="flex flex-col gap-3 [&>*]:m-0">
      <h2 className="font-sans text-sm font-semibold text-muted-foreground">Do this now</h2>
      <p className="font-serif text-xl font-semibold text-ink">{now.task}</p>
      {now.note === null ? null : <p className="text-ink-secondary">{now.note}</p>}
      {now.warnings.map((warning) => (
        <p
          key={warning.key}
          className="flex items-start gap-2 font-semibold text-status-overdue-fg"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden={true} />
          <span>
            <span className="sr-only">Warning: </span>
            {warning.text}
          </span>
        </p>
      ))}
      {now.action === null ? null : <PlanActionForm action={now.action} input={input} primary />}
      {now.secondary.map((action) => (
        <PlanActionForm
          key={action.kind === 'move' ? action.to : action.kind}
          action={action}
          input={input}
          primary={false}
        />
      ))}
    </section>
  )
}
