import { inputField } from '@/features/input/schemas'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

function trimmedText(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : ''
}

export function requiredRecordId(message: string) {
  return inputField((raw): Result<string, string> => {
    const value = trimmedText(raw)
    return isUuid(value) ? ok(value) : err(message)
  })
}

export function recordIdList(message: string) {
  return inputField((raw): Result<string[], string> => {
    const all = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]
    const ids = all.map(trimmedText).filter((id) => id !== '')
    if (ids.length === 0 || !ids.every(isUuid)) return err(message)
    return ok([...new Set(ids)])
  })
}

export function optionalChoice<const V extends readonly string[]>(noun: string, values: V) {
  return inputField((raw): Result<V[number] | null, string> => {
    const value = trimmedText(raw)
    if (value === '') return ok(null)
    const found = values.find((v) => v === value)
    return found === undefined ? err(`Choose ${noun}.`) : ok(found)
  })
}

export function prefixedRecordId<const K extends string>(kinds: readonly K[], message: string) {
  return inputField((raw): Result<{ kind: K; id: string }, string> => {
    const [kind, id, ...rest] = trimmedText(raw).split(':')
    const found = kinds.find((k) => k === kind)
    if (found === undefined || id === undefined || rest.length > 0 || !isUuid(id)) {
      return err(message)
    }
    return ok({ kind: found, id })
  })
}
