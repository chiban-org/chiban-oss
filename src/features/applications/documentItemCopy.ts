import type { ItemError } from '@/features/applications/documentItemAccess'

const ITEM_ERROR_COPY: ReadonlyMap<ItemError, string> = new Map([
  ['not_found', 'That application was not found.'],
  ['forbidden', 'You cannot change this document list.'],
  ['unknown_item', 'That document is not on this list.'],
  ['stage_closed', 'This document can no longer be changed here. Contact the town office.'],
  ['not_waivable', 'This document cannot be waived.'],
  ['document_not_found', 'That file is not on this application.'],
])

export function itemErrorCopy(error: ItemError): string {
  return ITEM_ERROR_COPY.get(error) ?? 'Something went wrong. Try again.'
}

export const ITEM_REASON_MAX = 2000
