export const NOTICE_CONTACTS_PATH = '/staff/notice-contacts'

export function entryAnchor(entryId: string): string {
  return `entry-${entryId}`
}

export function noticeContactHref(ref: string): string {
  return `${NOTICE_CONTACTS_PATH}#${entryAnchor(ref.split(':')[0] ?? ref)}`
}

export function addAssociationHref(parcelId: string): string {
  return `${NOTICE_CONTACTS_PATH}?add=association&parcel=${encodeURIComponent(parcelId)}`
}
