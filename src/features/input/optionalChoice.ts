import { err, ok, type Result } from '@/types/result'
import { blankAsNull, inputField } from './field'

export function optionalChoice<const V extends readonly string[]>(noun: string, values: V) {
  return inputField(
    blankAsNull((raw): Result<V[number], string> => {
      const value = typeof raw === 'string' ? raw.trim() : ''
      const found = values.find((v) => v === value)
      return found === undefined ? err(`Choose ${noun}.`) : ok(found)
    }),
  )
}
