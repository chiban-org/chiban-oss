import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { setCaseParcelAction } from '../actions'
import type { Can } from './can'
import { Hidden } from './Section'

export function CaseParcel({ detail, can }: { detail: CaseDetail; can: Can }) {
  const { row } = detail.staff
  return (
    <div className="space-y-2">
      {row.parcelId === null ? (
        <p className="m-0">No parcel is linked, so the case is not on any parcel page.</p>
      ) : (
        <p className="m-0">
          <Link href={`/staff/parcels/${row.parcelId}`} className="text-action underline">
            Open the linked parcel
          </Link>
        </p>
      )}
      {can.manage ? (
        <ActionForm
          action={setCaseParcelAction}
          submitLabel={row.parcelId === null ? 'Link the case to a parcel' : 'Change the parcel'}
        >
          <Hidden name="caseId" value={row.id} />
          <TextField label="Parcel number or site address" name="parcelRef" required />
        </ActionForm>
      ) : null}
    </div>
  )
}
