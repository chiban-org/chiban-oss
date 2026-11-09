import Link from 'next/link'
import { ID_FORMATS_SETTINGS_PATH } from '@/features/parcels/idFormatCopy'

export function NoIdFormatsNotice({ canEdit }: { canEdit: boolean }) {
  return (
    <p role="status" className="record-item max-w-[75ch]">
      No parcel ID formats are set up yet. Add them under Settings, then{' '}
      {canEdit ? (
        <Link href={ID_FORMATS_SETTINGS_PATH}>Parcel ID formats</Link>
      ) : (
        'Parcel ID formats (ask an administrator)'
      )}
      , before importing parcels, owner data or scanned files.
    </p>
  )
}
