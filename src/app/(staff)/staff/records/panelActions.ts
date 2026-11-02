import type { DocumentPanelActions } from '@/components/documents/DocumentPanel'
import {
  createStaffUploadIntentAction,
  retryPreservationAction,
  setAudiencesAction,
  setPublicAction,
  uploadRedactedAction,
} from './actions'

export const PANEL_ACTIONS: DocumentPanelActions = {
  setAudiences: setAudiencesAction,
  setPublic: setPublicAction,
  retry: retryPreservationAction,
  uploadRedacted: { createIntent: createStaffUploadIntentAction, finalize: uploadRedactedAction },
}
