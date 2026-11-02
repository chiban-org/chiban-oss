import { PARCEL_PAGE_SIZE } from '@/features/parcels/searchParcels'

export function MoreMatchesNotice({ more }: { more: boolean }) {
  if (!more) return null
  return (
    <p role="status">
      {`Showing the first ${PARCEL_PAGE_SIZE} matches. Add more of the address, owner, or parcel ID to narrow the search.`}
    </p>
  )
}
