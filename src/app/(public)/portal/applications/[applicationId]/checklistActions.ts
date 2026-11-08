import type { ChecklistActions } from '@/components/documents/DocumentChecklist'
import {
  linkItemAction,
  requestWaiverAction,
  unlinkItemAction,
  withdrawWaiverAction,
} from './documentItemActions'
import { createUploadIntentAction, finalizeUploadAction } from './uploadActions'

export const PORTAL_CHECKLIST_ACTIONS: ChecklistActions = {
  upload: { createIntent: createUploadIntentAction, finalize: finalizeUploadAction },
  link: linkItemAction,
  unlink: unlinkItemAction,
  requestWaiver: requestWaiverAction,
  withdrawWaiver: withdrawWaiverAction,
}
