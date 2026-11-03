import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { setCaseParcelAction } from '../actions'
import type { Can } from './can'
import { Hidden } from './Section'

export function CaseParcel({ detail, can }: { detail: CaseDetail; can: Can }) {
  const { row } = detail.staff
  const linked = row.parcelId !== null
  return (
    <div className="space-y-3">
      {linked ? null : (
        <p className="m-0 text-sm text-muted-foreground">
          No parcel is linked, so the case is not on any parcel page.
        </p>
      )}
      {can.manage ? (
        <details>
          <summary>{linked ? 'Change the parcel' : 'Link a parcel'}</summary>
          <ActionForm
            action={setCaseParcelAction}
            submitLabel={linked ? 'Change the parcel' : 'Link the case to a parcel'}
          >
            <Hidden name="caseId" value={row.id} />
            <TextField label="Parcel number or site address" name="parcelRef" required />
          </ActionForm>
        </details>
      ) : null}
    </div>
  )
}
