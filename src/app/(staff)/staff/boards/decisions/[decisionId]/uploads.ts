import {
  createStaffUploadIntentAction,
  finalizeStaffUploadAction,
} from '@/app/(staff)/staff/records/uploadActions'

export const UPLOAD_ACTIONS = {
  createIntent: createStaffUploadIntentAction,
  finalize: finalizeStaffUploadAction,
}
