const FALLBACK = 'The archival copy could not be made.'

const REASON_LABELS = new Map<string, string>([
  ['conversion_failed', 'The file could not be converted to an archival PDF.'],
  ['validation_failed', 'The converted file did not pass the archival format check.'],
  ['timeout', 'Converting the file took too long.'],
  ['ocr_conversion_failed', 'The scanned image could not be converted to a searchable PDF.'],
  ['ocr_timeout', 'Reading the scanned image took too long.'],
])

export function preservationReasonLabel(reason: string | null): string {
  return (reason === null ? undefined : REASON_LABELS.get(reason)) ?? FALLBACK
}
