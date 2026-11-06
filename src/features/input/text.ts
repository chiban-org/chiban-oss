import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'
import { blankAsNull, type FieldParse, inputField, trimmed } from './field'

export const DEFAULT_TEXT_MAX = 200
export const EMAIL_MAX = 254
export const PHONE_DIGITS = { min: 7, max: 15 } as const

export interface TextBounds {
  min?: number
  max?: number
}

function textParse(
  noun: string,
  { min = 1, max = DEFAULT_TEXT_MAX }: TextBounds,
): FieldParse<string> {
  return (raw) => {
    const value = trimmed(raw)
    if (value === '') return err(`Enter ${noun}.`)
    if (value.length < min) return err(`Enter ${noun} of at least ${min} characters.`)
    if (value.length > max) return err(`Enter ${noun} of ${max} characters or fewer.`)
    return ok(value)
  }
}

export function requiredText(noun: string, bounds: TextBounds = {}) {
  return inputField(textParse(noun, bounds))
}

export function optionalText(noun: string, bounds: TextBounds = {}) {
  return inputField(blankAsNull(textParse(noun, bounds)))
}

const EMAIL_PART = /^[^\s@]+$/

function looksLikeEmail(value: string): boolean {
  const [local = '', domain = '', ...rest] = value.split('@')
  const labels = domain.split('.')
  return (
    rest.length === 0 &&
    EMAIL_PART.test(local) &&
    labels.length >= 2 &&
    labels.every((label) => EMAIL_PART.test(label))
  )
}

export function emailAddress(noun: string) {
  return inputField((raw): Result<string, string> => {
    const value = trimmed(raw)
    if (value === '') return err(`Enter ${noun}.`)
    if (value.length > EMAIL_MAX || !looksLikeEmail(value))
      return err(`Enter ${noun} like name@example.com.`)
    return ok(value)
  })
}

const PHONE_CHARACTERS = /^[\d\s()+.-]+$/

function phoneParse(noun: string): FieldParse<string> {
  return (raw) => {
    const value = trimmed(raw)
    if (value === '') return err(`Enter ${noun}.`)
    const digits = value.replace(/\D/g, '').length
    const fits = digits >= PHONE_DIGITS.min && digits <= PHONE_DIGITS.max
    if (!PHONE_CHARACTERS.test(value) || !fits)
      return err(`Enter ${noun} with ${PHONE_DIGITS.min} to ${PHONE_DIGITS.max} digits.`)
    return ok(value)
  }
}

export function phone(noun: string) {
  return inputField(phoneParse(noun))
}

export function optionalPhone(noun: string) {
  return inputField(blankAsNull(phoneParse(noun)))
}

export function choice<const V extends readonly string[]>(noun: string, values: V) {
  return inputField((raw): Result<V[number], string> => {
    const value = trimmed(raw)
    const found = values.find((v) => v === value)
    return found === undefined ? err(`Choose ${noun}.`) : ok(found)
  })
}

export function recordId(noun: string) {
  return inputField((raw): Result<string, string> => {
    const value = trimmed(raw)
    return isUuid(value) ? ok(value) : err(`Choose ${noun}.`)
  })
}

export function checkbox() {
  return inputField((raw): Result<boolean, string> => ok(raw === 'on'))
}
