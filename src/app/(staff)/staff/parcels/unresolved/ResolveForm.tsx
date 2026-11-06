import { ActionForm } from '@/components/ActionForm'
import { ParcelPicker } from '@/components/parcels/picker/ParcelPicker'
import { resolveUnresolvedAction } from '../[parcelId]/actions'

export function ResolveForm({ linkId, record }: { linkId: string; record: string }) {
  return (
    <ActionForm
      action={resolveUnresolvedAction}
      submitLabel="Link to parcel"
      className="flex flex-wrap items-center gap-x-3"
      compact
    >
      <input type="hidden" name="linkId" value={linkId} />
      <ParcelPicker
        name="parcelRef"
        label={`Parcel for ${record}`}
        labelHidden
        required
        className="w-64"
      />
    </ActionForm>
  )
}
