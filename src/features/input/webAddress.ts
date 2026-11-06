import { err, ok } from '@/types/result'
import { blankAsNull, inputField } from './field'

export function optionalWebAddress(noun: string, max: number) {
  return inputField(
    blankAsNull((raw) => {
      const value = typeof raw === 'string' ? raw.trim() : ''
      if (value.length > max) return err(`Enter ${noun} of ${max} characters or fewer.`)
      const parsed = URL.canParse(value) ? new URL(value) : null
      const web = parsed?.protocol === 'https:' || parsed?.protocol === 'http:'
      return web ? ok(value) : err(`Enter ${noun} starting with https://.`)
    }),
  )
}
