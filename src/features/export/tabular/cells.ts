import { canonicalJson } from '@/features/export/canonical'

const FORMULA_START = /^[=+\-@\t\r]/
const EXCEL_CELL_LIMIT = 32_767

export const CSV_BOM = '﻿'

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  return canonicalJson(value)
}

export function safeForSpreadsheet(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text
}

export function clampForExcel(text: string): string {
  return text.length > EXCEL_CELL_LIMIT ? text.slice(0, EXCEL_CELL_LIMIT) : text
}

export function csvField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function csvLine(texts: string[]): string {
  return `${texts.map(csvField).join(',')}\r\n`
}
