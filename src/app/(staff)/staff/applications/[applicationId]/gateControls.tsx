import { ActionForm } from '@/components/ActionForm'
import { AreaField, TextField } from '@/components/staff/fields'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import type { GateResult } from '@/features/gates/evaluateGates'
import { overrideGateAction, revokeOverrideAction, statutoryExceptionAction } from './gateActions'

export function GateControls({ view, result }: { view: StaffApplicationView; result: GateResult }) {
  const { canOverrideGate, canRecordStatutoryException } = view.permissions
  if (result.override !== null) {
    const allowed =
      result.override.kind === 'statutory_exception' ? canRecordStatutoryException : canOverrideGate
    return allowed ? (
      <ActionForm
        action={revokeOverrideAction}
        submitLabel="Revoke override"
        confirm={{
          title: `Revoke the override on ${result.label}?`,
          body: 'The gate is checked again and blocks the application until it passes or is overridden again.',
          confirmLabel: 'Revoke the override',
        }}
      >
        <input type="hidden" name="overrideId" value={result.override.id} />
      </ActionForm>
    ) : null
  }
  if (result.effective === 'pass') return null
  if (result.kind === 'administrative' && canOverrideGate) {
    return (
      <details>
        <summary>Override this gate</summary>
        <ActionForm action={overrideGateAction} submitLabel="Override with reason">
          <input type="hidden" name="applicationId" value={view.id} />
          <input type="hidden" name="gateKey" value={result.key} />
          <TextField label="Reason (at least 10 characters)" name="reason" required />
        </ActionForm>
      </details>
    )
  }
  if (result.kind === 'statutory' && canRecordStatutoryException) {
    return (
      <details>
        <summary>Record a statutory exception</summary>
        <ActionForm action={statutoryExceptionAction} submitLabel="Record exception">
          <input type="hidden" name="applicationId" value={view.id} />
          <input type="hidden" name="gateKey" value={result.key} />
          <TextField label="Legal authority: citation" name="citation" required />
          <AreaField label="Legal authority: explanation" name="explanation" required />
        </ActionForm>
      </details>
    )
  }
  return null
}
