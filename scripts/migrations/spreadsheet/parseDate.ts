import { type CivilDate, parseCivilDate } from '@/types/civilDate'
import { err, type Result } from '@/types/result'
import type { DateFormat } from './mapping'

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)
const MS_PER_DAY = 86_400_000
const MAX_SERIAL = 2_958_465

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const SLASH_LONG = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
const SLASH_SHORT = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

function civil(year: number, month: number, day: number): Result<CivilDate, 'unparseable'> {
  const parsed = parseCivilDate(`${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`)
  return parsed.ok ? parsed : err('unparseable')
}

function fromSerial(serial: number): Result<CivilDate, 'unparseable'> {
  if (!Number.isFinite(serial) || serial < 1 || serial > MAX_SERIAL) return err('unparseable')
  const d = new Date(EXCEL_EPOCH_MS + Math.floor(serial) * MS_PER_DAY)
  return civil(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

function fromUtcDate(d: Date): Result<CivilDate, 'unparseable'> {
  if (Number.isNaN(d.getTime())) return err('unparseable')
  return civil(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

function fromText(
  text: string,
  formats: readonly DateFormat[],
  pivot: number,
): Result<CivilDate, 'unparseable'> {
  const iso = ISO.exec(text)
  if (iso !== null && formats.includes('YYYY-MM-DD')) {
    return civil(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  }
  const long = SLASH_LONG.exec(text)
  if (long !== null && formats.includes('MM/DD/YYYY')) {
    return civil(Number(long[3]), Number(long[1]), Number(long[2]))
  }
  const short = SLASH_SHORT.exec(text)
  if (short !== null && formats.includes('M/D/YY')) {
    const yy = Number(short[3])
    return civil(yy > pivot ? 1900 + yy : 2000 + yy, Number(short[1]), Number(short[2]))
  }
  if (/^\d+$/.test(text) && formats.includes('excel_serial')) {
    return fromSerial(Number(text))
  }
  return err('unparseable')
}

export function parseHistoricalDate(
  raw: string | number | Date,
  formats: readonly DateFormat[],
  pivot: number,
): Result<CivilDate, 'unparseable'> {
  if (raw instanceof Date) return fromUtcDate(raw)
  if (typeof raw === 'number') {
    return formats.includes('excel_serial') ? fromSerial(raw) : err('unparseable')
  }
  return fromText(raw.trim(), formats, pivot)
}
