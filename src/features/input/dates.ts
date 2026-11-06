import type { z } from 'zod'
import { formatCivilDate } from '@/lib/formatDate'
import { type CivilDate, parseCivilDate } from '@/types/civilDate'
import { err, ok } from '@/types/result'
import { blankAsNull, type FieldParse, inputField, trimmed } from './field'

export const EARLIEST_CIVIL_DATE = '1900-01-01' as CivilDate
export const LATEST_CIVIL_DATE = '2099-12-31' as CivilDate

export interface DateBounds {
  earliest?: CivilDate
  latest?: CivilDate
}

function dateParse(noun: string, bounds: DateBounds): FieldParse<CivilDate> {
  const earliest = bounds.earliest ?? EARLIEST_CIVIL_DATE
  const latest = bounds.latest ?? LATEST_CIVIL_DATE
  return (raw) => {
    const value = trimmed(raw)
    if (value === '') return err(`Enter ${noun}.`)
    const parsed = parseCivilDate(value)
    if (!parsed.ok) return err(`Enter ${noun} as a date.`)
    if (parsed.value < earliest || parsed.value > latest)
      return err(
        `Enter ${noun} between ${formatCivilDate(earliest)} and ${formatCivilDate(latest)}.`,
      )
    return ok(parsed.value)
  }
}

export function civilDate(noun: string, bounds: DateBounds = {}) {
  return inputField(dateParse(noun, bounds))
}

export function optionalCivilDate(noun: string, bounds: DateBounds = {}) {
  return inputField(blankAsNull(dateParse(noun, bounds)))
}

type Ordered = string | number | null

export function endNotBefore<K extends string>(start: K, end: K, message: string) {
  return (value: { [P in K]?: Ordered }, ctx: z.RefinementCtx): void => {
    const from = value[start] ?? null
    const to = value[end] ?? null
    if (from === null || to === null) return
    if (to < from) ctx.addIssue({ code: 'custom', path: [end], message })
  }
}
