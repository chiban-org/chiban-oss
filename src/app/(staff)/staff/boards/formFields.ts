import { errorOrOk } from '@/features/boards/actionResult'
import { boardErrorCopy } from '@/features/boards/errorCopy'
import { inputField } from '@/features/input/schemas'
import type { ActionResult } from '@/server/actionRunner'
import { refuseField } from '@/server/formInput'
import { err, ok } from '@/types/result'
import { isUuid } from '@/utils/uuid'

export function valueList() {
  return inputField((raw) => {
    const all = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]
    return ok(all.filter((v): v is string => typeof v === 'string' && v.trim() !== ''))
  })
}

export type FieldOfError = Readonly<Record<string, string>>

export function errorOrField(
  result: { ok: true } | { ok: false; error: unknown },
  message: string,
  fieldOf: FieldOfError = {},
): ActionResult {
  if (!result.ok && typeof result.error === 'string') {
    const field = fieldOf[result.error]
    if (field !== undefined) return refuseField(field, boardErrorCopy(result.error))
  }
  return errorOrOk(result, message)
}

export function optionalRecordId(noun: string) {
  return inputField((raw) => {
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (value === '') return ok(null)
    return isUuid(value) ? ok(value) : err(`Choose ${noun}.`)
  })
}

export function uuidList() {
  return inputField((raw) => {
    const all = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]
    return ok(all.filter((v): v is string => typeof v === 'string' && isUuid(v)))
  })
}
