import { ActionForm } from '@/components/ActionForm'
import { NextStep } from '@/components/layout/NextStep'
import { SelectField, TextField } from '@/components/staff/fields'
import { type Blocker, type NextStepPlan, planNextStep } from '@/features/applications/nextStep'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { type CoreState, STATE_LABELS } from '@/features/applications/states'
import type { BoardPanelData } from '@/features/boards/panelData'
import { setSubstepAction, transitionAction } from './actions'
import { type BoardStep, BoardStepLine, boardStepFor } from './boardStep'
import { renewAction } from './buildingActions'

export interface RailPlan extends NextStepPlan {
  board: BoardStep | null
}

const MOVE_LABELS: ReadonlyMap<string, string> = new Map(
  Object.entries(STATE_LABELS).map(([state, label]) => [state, label.toLowerCase()]),
)

export function moveLabel(to: CoreState): string {
  return MOVE_LABELS.get(to) ?? to
}

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
    <ActionForm action={transitionAction} submitLabel={label} variant={variant} compact>
      <input type="hidden" name="applicationId" value={view.id} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="expectedRowVersion" value={view.rowVersion} />
    </ActionForm>
  )
}

export function BlockerList({ to, blockers }: { to: CoreState; blockers: Blocker[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-sm font-semibold">{`Before ${moveLabel(to)}`}</p>
      <ul
        aria-label={`What blocks ${moveLabel(to)}`}
        className="m-0 flex list-none flex-col gap-2 p-0"
      >
        {blockers.map((b) => (
          <li key={b.key} className="text-sm">
            <a href={`#${b.anchor}`} className="font-semibold">
              {b.label}
            </a>
            {b.reason === '' ? null : <span className="block text-ink-secondary">{b.reason}</span>}
          </li>
        ))}
      </ul>
    </div>
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

export function MoreActions({ view, moves }: { view: StaffApplicationView; moves: CoreState[] }) {
  const renews = view.state === 'issued' && view.permissions.canIssue
  if (moves.length === 0 && !renews) return null
  return (
    <details className="more-actions">
      <summary className="text-sm">More actions</summary>
      <div className="flex flex-col gap-3">
        <RenewForm view={view} />
        {moves.map((to) => (
          <details key={to}>
            <summary className="text-sm">{`Move to ${moveLabel(to)}`}</summary>
            <p className="m-0 mb-2 text-sm">
              {`Moving to ${moveLabel(to)} ends this application. It cannot be undone.`}
            </p>
            <MoveForm
              view={view}
              to={to}
              label={`Yes, move to ${moveLabel(to)}`}
              variant="destructive"
            />
          </details>
        ))}
      </div>
    </details>
  )
}

function SubstepForm({ view }: { view: StaffApplicationView }) {
  if (view.substeps.length === 0) return null
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

export function nextStepPlan(
  view: StaffApplicationView,
  board: BoardPanelData | null = null,
): RailPlan {
  return {
    ...planNextStep(view.nextTransitions, view.gates, view.allowedMoves),
    board: boardStepFor(board),
  }
}

function clearLeadText(plan: NextStepPlan, to: CoreState): string {
  return plan.leadAllowed
    ? `Nothing blocks ${moveLabel(to)}. It is under More actions.`
    : `Nothing blocks ${moveLabel(to)}. Your role cannot make this move.`
}

export function LeadStatus({ plan }: { plan: RailPlan }) {
  const { lead } = plan
  if (lead === null || plan.primary !== null) return <BoardStepLine step={plan.board} />
  if (lead.blockers.length > 0) return <BlockerList to={lead.to} blockers={lead.blockers} />
  return <p className="text-sm">{clearLeadText(plan, lead.to)}</p>
}

export function PrimaryMove({ view, plan }: { view: StaffApplicationView; plan: RailPlan }) {
  if (plan.primary === null) return null
  return (
    <MoveForm
      view={view}
      to={plan.primary}
      label={`Move to ${moveLabel(plan.primary)}`}
      variant="default"
    />
  )
}

export function NextStepCard({ view, plan }: { view: StaffApplicationView; plan: RailPlan }) {
  const empty =
    plan.lead === null &&
    plan.board === null &&
    plan.terminal.length === 0 &&
    view.substeps.length === 0
  if (empty && !(view.state === 'issued' && view.permissions.canIssue)) return null
  return (
    <NextStep>
      <PrimaryMove view={view} plan={plan} />
      <LeadStatus plan={plan} />
      {plan.secondary.map((to) => (
        <MoveForm
          key={to}
          view={view}
          to={to}
          label={`Move to ${moveLabel(to)}`}
          variant="outline"
        />
      ))}
      <SubstepForm view={view} />
      <MoreActions view={view} moves={plan.terminal} />
    </NextStep>
  )
}
