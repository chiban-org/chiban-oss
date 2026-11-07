import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import type { CaseMove } from '@/features/enforcement/workPlanTypes'
import { setCaseStatusAction } from '../actions'
import { Hidden } from './Section'

export const MOVE_LABELS = {
  investigating: 'Start the investigation',
  no_violation: 'Record no violation',
  resolved: 'Resolve the case',
  closed: 'Close the case',
} as const satisfies Record<CaseMove, string>

const MOVE_LABEL_OF = new Map<CaseMove, string>(Object.entries(MOVE_LABELS) as [CaseMove, string][])

type Variant = 'default' | 'outline' | 'destructive'

function CaseHidden({ detail, to }: { detail: CaseDetail; to: CaseMove }) {
  const { row } = detail.staff
  return (
    <>
      <Hidden name="caseId" value={row.id} />
      <Hidden name="expectedRowVersion" value={row.rowVersion} />
      <Hidden name="to" value={to} />
    </>
  )
}

export function MoveForm({
  detail,
  to,
  variant,
}: {
  detail: CaseDetail
  to: Exclude<CaseMove, 'closed'>
  variant: Variant
}) {
  const ending = to === 'no_violation'
  return (
    <ActionForm
      action={setCaseStatusAction}
      submitLabel={MOVE_LABEL_OF.get(to) ?? to}
      variant={ending ? 'destructive' : variant}
      compact
      confirm={
        ending
          ? {
              title: `Record no violation for ${detail.staff.row.number}?`,
              body: 'The case ends with no violation found. After this it can only be closed.',
              confirmLabel: MOVE_LABELS.no_violation,
            }
          : undefined
      }
    >
      <CaseHidden detail={detail} to={to} />
    </ActionForm>
  )
}

export function CloseForm({ detail }: { detail: CaseDetail }) {
  return (
    <ActionForm
      action={setCaseStatusAction}
      submitLabel={MOVE_LABELS.closed}
      variant="destructive"
      confirm={{
        title: 'Close this case?',
        body: 'The case is closed with your reason. A closed case cannot be moved to another status.',
        confirmLabel: MOVE_LABELS.closed,
      }}
    >
      <CaseHidden detail={detail} to="closed" />
      <TextField label="Reason for closing" name="reason" required />
    </ActionForm>
  )
}

export function CaseMoreActions({
  detail,
  moves,
}: {
  detail: CaseDetail
  moves: readonly CaseMove[]
}) {
  if (moves.length === 0) return null
  return (
    <details className="more-actions">
      <summary className="text-sm">More actions</summary>
      <div className="flex flex-col gap-3">
        {moves.map((to) =>
          to === 'closed' ? (
            <details key={to}>
              <summary className="text-sm">{MOVE_LABELS.closed}</summary>
              <CloseForm detail={detail} />
            </details>
          ) : (
            <MoveForm key={to} detail={detail} to={to} variant="outline" />
          ),
        )}
      </div>
    </details>
  )
}
