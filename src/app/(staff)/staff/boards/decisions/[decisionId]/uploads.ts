import {
  createStaffUploadIntentAction,
  finalizeStaffUploadAction,
} from '@/app/(staff)/staff/records/actions'

export const UPLOAD_ACTIONS = {
  createIntent: createStaffUploadIntentAction,
  finalize: finalizeStaffUploadAction,
}
