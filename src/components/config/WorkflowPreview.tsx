import { STATE_LABELS } from '@/features/applications/states'
import { workflowIssueText } from '@/features/workflow/issueText'
import type { WorkflowPreview as Preview } from '@/features/workflow/previewWorkflow'
import { formatCivilDate } from '@/lib/formatDate'

const GATE_OUTCOME: Record<string, string> = {
  pass: 'Passes',
  blocked: 'Blocked',
  unknown: 'Cannot be told until a real record exists',
}

export function WorkflowPreview({ preview }: { preview: Preview }) {
  return (
    <section aria-label="Preview" className="space-y-4">
      {preview.issues.length === 0 ? null : (
        <ul role="alert" className="m-0 list-none space-y-1 p-0 text-status-failed-fg">
          {preview.issues.map((issue) => (
            <li key={`${issue.code}:${issue.state ?? ''}:${issue.key ?? ''}`}>
              {workflowIssueText(issue)}
            </li>
          ))}
        </ul>
      )}
      {preview.steps.map((step) => (
        <article
          key={step.state}
          aria-label={STATE_LABELS[step.state]}
          className="rounded-md border p-3"
        >
          <h3 className="text-base font-semibold">{STATE_LABELS[step.state]}</h3>
          {step.substeps.length === 0 ? null : (
            <p className="text-sm">{`Steps: ${step.substeps.map((s) => s.label).join(', ')}`}</p>
          )}
          {step.gates.length === 0 ? null : (
            <ul className="m-0 list-none p-0 text-sm">
              {step.gates.map((gate) => (
                <li
                  key={gate.key}
                >{`${gate.label}: ${GATE_OUTCOME[gate.outcome] ?? gate.outcome}`}</li>
              ))}
            </ul>
          )}
          {step.clocks.length === 0 ? null : (
            <ul className="m-0 list-none space-y-1 p-0 text-sm">
              {step.clocks.map((clock) => (
                <li key={clock.ruleKey}>
                  <strong>{clock.label}</strong>
                  {`, due ${formatCivilDate(clock.due)}. ${clock.consequence}`}
                </li>
              ))}
            </ul>
          )}
          {step.notices.length === 0 ? null : (
            <ul className="m-0 list-none p-0 text-sm">
              {step.notices.map((notice) => (
                <li key={notice.requirementKey}>
                  {`${notice.label}: ${notice.channel}, due ${formatCivilDate(notice.due)}`}
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </section>
  )
}
