export const NOTICE_CONTACTS_PATH = '/staff/notice-contacts'

export type ContactSource = 'association_roster' | 'park_roster' | 'restriction_roster'

const SOURCE_TABS: ReadonlyMap<ContactSource, string> = new Map([
  ['association_roster', 'associations'],
  ['park_roster', 'parks'],
  ['restriction_roster', 'holders'],
])

export function entryAnchor(entryId: string): string {
  return `entry-${entryId}`
}

export function noticeContactHref(source: ContactSource, ref: string): string {
  const entryId = ref.split(':')[0] ?? ref
  const query = new URLSearchParams({ kind: SOURCE_TABS.get(source) ?? '', entry: entryId })
  return `${NOTICE_CONTACTS_PATH}?${query.toString()}#${entryAnchor(entryId)}`
}

export function addAssociationHref(parcelId: string): string {
  return `${NOTICE_CONTACTS_PATH}?add=association&parcel=${encodeURIComponent(parcelId)}`
}
