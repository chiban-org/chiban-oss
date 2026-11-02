export interface MigrationReport {
  source: number
  imported: number
  duplicateLinked: number
  excepted: number
  skipped: number
  ocrFailed: number
  unresolvedParcel: number
  exceptionsByReason: Record<string, number>
}

export interface ScanInput {
  root: string
  name: string
  seriesKey: string
  folderPattern: string
  idFormat: string
}
