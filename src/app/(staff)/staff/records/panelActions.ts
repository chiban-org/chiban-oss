import type { DocumentPanelActions } from '@/components/documents/DocumentPanel'
import {
  createStaffUploadIntentAction,
  retryPreservationAction,
  setAudiencesAction,
  setPublicAction,
  uploadRedactedAction,
} from './actions'
import { approveRenditionAction, revokeApprovalAction } from './renditionActions'

export const PANEL_ACTIONS: DocumentPanelActions = {
  setAudiences: setAudiencesAction,
  setPublic: setPublicAction,
  approve: approveRenditionAction,
  revoke: revokeApprovalAction,
  retry: retryPreservationAction,
  uploadRedacted: { createIntent: createStaffUploadIntentAction, finalize: uploadRedactedAction },
}
