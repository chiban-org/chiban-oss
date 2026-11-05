import { ActionForm } from '@/components/ActionForm'
import { AppealGraph, type GraphNode } from '@/components/appeals/AppealGraph'
import { SelectField, TextField } from '@/components/staff/fields'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { APPEAL_OUTCOME_OPTIONS, labelFor } from '@/features/building/labels'
import { formatCivilDate } from '@/lib/formatDate'
import { lowerFirst } from '@/lib/words'
import { recordAppealAction, resolveAppealAction } from './buildingActions'

function appealLine(a: StaffApplicationView['appeals'][number]): string {
  const filed = `Filed ${formatCivilDate(a.filedOn)} by ${a.appellantName}.`
  if (a.resolvedOn === null) return `${filed} Open.`
  return `${filed} Resolved ${formatCivilDate(a.resolvedOn)}: ${lowerFirst(labelFor(APPEAL_OUTCOME_OPTIONS, a.outcome ?? ''))}.`
}

function RecordAppealForm({ view }: { view: StaffApplicationView }) {
  if (view.state !== 'issued' || !view.permissions.canIssue) return null
  return (
    <details>
      <summary>Record an appeal</summary>
      <ActionForm action={recordAppealAction} submitLabel="Record appeal">
        <input type="hidden" name="applicationId" value={view.id} />
        <TextField label="Appellant" name="appellantName" required />
        <TextField label="Filed on" name="filedOn" type="date" defaultValue={view.today} required />
      </ActionForm>
    </details>
  )
}

function ResolveAppealForm({ view }: { view: StaffApplicationView }) {
  const open = view.appeals.some((a) => a.resolvedOn === null)
  if (!open || !view.permissions.canIssue) return null
  return (
    <details>
      <summary>Resolve the appeal</summary>
      <ActionForm action={resolveAppealAction} submitLabel="Resolve appeal">
        <input type="hidden" name="applicationId" value={view.id} />
        <SelectField label="Outcome" name="outcome" options={APPEAL_OUTCOME_OPTIONS} />
        <TextField
          label="Resolved on"
          name="resolvedOn"
          type="date"
          defaultValue={view.today}
          required
        />
      </ActionForm>
    </details>
  )
}

export function hasAppeals(view: StaffApplicationView, graph: readonly GraphNode[]): boolean {
  return view.appeals.length > 0 || graph.length > 0
}

export function AppealsPanel({ view, graph }: { view: StaffApplicationView; graph: GraphNode[] }) {
  return (
    <section aria-label="Appeals" id="appeals">
      <h2>Appeals</h2>
      {hasAppeals(view, graph) ? null : <p>No appeal has been filed.</p>}
      {view.appeals.length === 0 ? null : (
        <ul className="list-none p-0">
          {view.appeals.map((a) => (
            <li key={a.id} className="record-item pb-3">
              {appealLine(a)}
            </li>
          ))}
        </ul>
      )}
      {graph.length === 0 ? null : <AppealGraph nodes={graph} />}
      <ResolveAppealForm view={view} />
      <RecordAppealForm view={view} />
    </section>
  )
}
