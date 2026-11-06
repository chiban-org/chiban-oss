import { err, ok } from '@/types/result'
import { isUuid } from '@/utils/uuid'
import { blankAsNull, inputField } from './field'

export function optionalRecordId(message: string) {
  return inputField(
    blankAsNull((raw) => {
      const value = typeof raw === 'string' ? raw.trim() : ''
      return isUuid(value) ? ok(value) : err(message)
    }),
  )
}
