import type { UploaderActions } from '@/components/documents/Uploader'
import type { ActionResult } from '@/server/actionRunner'

export type ChecklistAction = (formData: FormData) => Promise<ActionResult>

export type ChecklistActor = 'applicant' | 'staff'

export interface ChecklistActions {
  upload?: UploaderActions
  link: ChecklistAction
  unlink: ChecklistAction
  requestWaiver?: ChecklistAction
  withdrawWaiver?: ChecklistAction
  accept?: ChecklistAction
  undoAccept?: ChecklistAction
}

export interface ChecklistPermissions {
  canFile: boolean
  canAccept: boolean
  canUploadOther: boolean
}
