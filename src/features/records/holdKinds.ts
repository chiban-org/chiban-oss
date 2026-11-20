import { recordsRequest } from '@/features/packs/vocabulary'

export type HoldTargetKind =
  | 'project'
  | 'application'
  | 'document'
  | 'enforcement_case'
  | 'rtk_request'

export function holdTargetLabels(): Record<HoldTargetKind, string> {
  return {
    project: 'Project',
    application: 'Application',
    document: 'Document',
    enforcement_case: 'Case',
    rtk_request: recordsRequest(),
  }
}

export function holdTargetOptions(): [HoldTargetKind, string][] {
  return [
    ['project', 'Project'],
    ['application', 'Application'],
    ['document', 'Document'],
    ['enforcement_case', 'Enforcement case'],
    ['rtk_request', recordsRequest()],
  ]
}
