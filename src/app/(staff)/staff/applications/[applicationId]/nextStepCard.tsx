import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { type CoreState, isTerminalState } from '@/features/applications/states'
import { moveTask } from '@/features/applications/workPlan'
import { setSubstepAction, transitionAction } from './actions'
import { renewAction } from './buildingActions'

const ENDING_VERBS: ReadonlyMap<CoreState, string> = new Map([
  ['closed', 'Close'],
  ['denied', 'Deny'],
  ['withdrawn', 'Withdraw'],
  ['expired', 'Expire'],
])

export function MoveForm({
  view,
  to,
  label,
  variant,
}: {
  view: StaffApplicationView
  to: CoreState
  label: string
  variant: 'default' | 'outline' | 'destructive'
}) {
  return (
    <ActionForm
      action={transitionAction}
      submitLabel={label}
      variant={variant}
      compact
      confirm={
        isTerminalState(to)
          ? {
              title: `${ENDING_VERBS.get(to) ?? moveTask(to)} ${view.number}?`,
              body: 'This ends the application. It cannot be undone.',
              confirmLabel: moveTask(to),
            }
          : undefined
      }
    >
      <input type="hidden" name="applicationId" value={view.id} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="expectedRowVersion" value={view.rowVersion} />
    </ActionForm>
  )
}

function RenewForm({ view }: { view: StaffApplicationView }) {
  if (view.state !== 'issued' || !view.permissions.canIssue) return null
  return (
    <details>
      <summary className="text-sm">Renew the permit</summary>
      <ActionForm action={renewAction} submitLabel="Renew permit">
        <input type="hidden" name="applicationId" value={view.id} />
        <TextField
          label="Renewed on"
          name="renewedOn"
          type="date"
          defaultValue={view.today}
          required
        />
      </ActionForm>
    </details>
  )
}

function offersSubstep(view: StaffApplicationView): boolean {
  return view.substeps.length > 0 && view.permissions.canManageWorkflow
}

function SubstepForm({ view }: { view: StaffApplicationView }) {
  if (!offersSubstep(view)) return null
  const options = view.substeps.map((s): [string, string] => [s.key, s.label])
  return (
    <ActionForm action={setSubstepAction} submitLabel="Set step">
      <input type="hidden" name="applicationId" value={view.id} />
      <input type="hidden" name="expectedRowVersion" value={view.rowVersion} />
      <SelectField
        label="Step"
        name="substep"
        defaultValue={view.substep ?? ''}
        options={view.substep === null ? [['', 'Not set'], ...options] : options}
      />
    </ActionForm>
  )
}

export function MoreActions({ view, moves }: { view: StaffApplicationView; moves: CoreState[] }) {
  const renews = view.state === 'issued' && view.permissions.canIssue
  if (moves.length === 0 && !renews && !offersSubstep(view)) return null
  return (
    <details className="more-actions">
      <summary className="text-sm">More actions</summary>
      <div className="flex flex-col gap-3">
        <RenewForm view={view} />
        {moves.map((to) => (
          <MoveForm key={to} view={view} to={to} label={moveTask(to)} variant="destructive" />
        ))}
        <SubstepForm view={view} />
      </div>
    </details>
  )
}
