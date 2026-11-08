import { z } from 'zod'
import type { ItemError } from '@/features/applications/documentItemAccess'
import { ITEM_REASON_MAX, itemErrorCopy } from '@/features/applications/documentItemCopy'
import { ITEM_KEY_MAX } from '@/features/applications/documentItemSchema'
import { recordId, requiredText } from '@/features/input/schemas'
import type { ActionResult } from '@/server/actionRunner'
import type { Result } from '@/types/result'

export const ItemForm = z.object({
  applicationId: recordId('an application'),
  itemKey: requiredText('a document', { max: ITEM_KEY_MAX }),
})
export const ItemFileForm = ItemForm.extend({ documentId: recordId('a file') })
export const ItemReasonForm = ItemForm.extend({
  reason: requiredText('a reason', { max: ITEM_REASON_MAX }),
})

export function itemOutcome(result: Result<void, ItemError>, message: string): ActionResult {
  return result.ok ? { ok: true, message } : { ok: false, error: itemErrorCopy(result.error) }
}
