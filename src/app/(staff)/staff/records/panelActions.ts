import type { DocumentPanelActions } from '@/components/documents/DocumentPanel'
import {
  assignSeriesAction,
  retryPreservationAction,
  setAudiencesAction,
  setPublicAction,
} from './actions'
import { approveRenditionAction, revokeApprovalAction } from './renditionActions'
import { createStaffUploadIntentAction, uploadRedactedAction } from './uploadActions'

export const PANEL_ACTIONS: DocumentPanelActions = {
  setAudiences: setAudiencesAction,
  setPublic: setPublicAction,
  approve: approveRenditionAction,
  revoke: revokeApprovalAction,
  retry: retryPreservationAction,
  setSeries: assignSeriesAction,
  uploadRedacted: { createIntent: createStaffUploadIntentAction, finalize: uploadRedactedAction },
}
