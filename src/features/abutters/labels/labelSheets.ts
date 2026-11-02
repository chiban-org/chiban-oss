export interface LabelSheet {
  key: 'avery_5160' | 'avery_5163'
  label: string
  pageWidthPt: 612
  pageHeightPt: 792
  columns: number
  rows: number
  labelWidthPt: number
  labelHeightPt: number
  leftMarginPt: number
  topMarginPt: number
  columnPitchPt: number
  rowPitchPt: number
}

export const AVERY_5160: LabelSheet = {
  key: 'avery_5160',
  label: 'Avery 5160 (30 per sheet, 1 inch by 2.625 inches)',
  pageWidthPt: 612,
  pageHeightPt: 792,
  columns: 3,
  rows: 10,
  labelWidthPt: 189,
  labelHeightPt: 72,
  leftMarginPt: 13.5,
  topMarginPt: 36,
  columnPitchPt: 198,
  rowPitchPt: 72,
}

export const AVERY_5163: LabelSheet = {
  key: 'avery_5163',
  label: 'Avery 5163 (10 per sheet, 2 inches by 4 inches)',
  pageWidthPt: 612,
  pageHeightPt: 792,
  columns: 2,
  rows: 5,
  labelWidthPt: 288,
  labelHeightPt: 144,
  leftMarginPt: 11.25,
  topMarginPt: 36,
  columnPitchPt: 301.5,
  rowPitchPt: 144,
}

export const LABEL_SHEETS: Record<LabelSheet['key'], LabelSheet> = {
  avery_5160: AVERY_5160,
  avery_5163: AVERY_5163,
}

export function isSheetKey(value: string): value is LabelSheet['key'] {
  return value === 'avery_5160' || value === 'avery_5163'
}

export function labelsPerPage(sheet: LabelSheet): number {
  return sheet.columns * sheet.rows
}

export function labelOrigin(
  sheet: LabelSheet,
  index: number,
): { page: number; xPt: number; yFromTopPt: number } {
  const perPage = labelsPerPage(sheet)
  const slot = index % perPage
  return {
    page: Math.floor(index / perPage),
    xPt: sheet.leftMarginPt + (slot % sheet.columns) * sheet.columnPitchPt,
    yFromTopPt: sheet.topMarginPt + Math.floor(slot / sheet.columns) * sheet.rowPitchPt,
  }
}
