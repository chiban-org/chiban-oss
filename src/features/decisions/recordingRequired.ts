import type { ProceedingClassification } from '@/features/packs/schema'

export function recordingIsRequired(classification: ProceedingClassification | undefined): boolean {
  return classification?.recordingRequired === true
}

export type VarianceValidity = 'not_required' | 'pending_recording' | 'recorded' | 'void'

export const VALIDITY_LABELS: Record<VarianceValidity, string> = {
  not_required: '',
  pending_recording: 'Approved, not valid until recorded',
  recorded: 'Recorded',
  void: 'Void, not recorded in time',
}
