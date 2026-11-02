import { evaluateCondition } from '@/features/forms/condition'
import type { FormBody, FormField } from '@/features/forms/formSchema'
import { parseCivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type FieldValue = string | number | boolean | string[]

export interface ProjectFacts {
  classification: 'residential' | 'nonresidential' | null
  dwellingUnits: number | null
  afterTheFact: boolean
  regionalImpact?: boolean
}

export type FieldErrorCode =
  | 'required'
  | 'type'
  | 'min'
  | 'max'
  | 'min_length'
  | 'max_length'
  | 'option'
  | 'staff_only'

export interface FieldError {
  field: string
  code: FieldErrorCode
}

const DIGITS = /^\d+$/
const MONEY_PLACES = 2
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_DIGITS = 7

type Parsed = { ok: true; value: FieldValue } | { ok: false; code: FieldErrorCode }

function isBlank(raw: unknown): boolean {
  return raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0)
}

type NumberKind = 'integer' | 'decimal' | 'money'

function isNumberText(text: string, kind: NumberKind): boolean {
  const unsigned = text.startsWith('-') ? text.slice(1) : text
  const [whole = '', fraction, ...rest] = unsigned.split('.')
  if (rest.length > 0 || !DIGITS.test(whole)) return false
  if (fraction === undefined) return true
  if (kind === 'integer' || !DIGITS.test(fraction)) return false
  return kind !== 'money' || fraction.length <= MONEY_PLACES
}

function parseNumberText(raw: unknown, kind: NumberKind): string | null {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : null
  return text !== null && isNumberText(text, kind) ? text : null
}

function parseSelect(field: FormField, raw: unknown): Parsed {
  const allowed = new Set((field.options ?? []).map((o) => o.value))
  if (field.type === 'select') {
    return typeof raw === 'string' && allowed.has(raw)
      ? { ok: true, value: raw }
      : { ok: false, code: 'option' }
  }
  if (!Array.isArray(raw) || !raw.every((v) => typeof v === 'string')) {
    return { ok: false, code: 'type' }
  }
  return raw.every((v) => allowed.has(v)) ? { ok: true, value: raw } : { ok: false, code: 'option' }
}

function parseText(field: FormField, raw: unknown): Parsed {
  if (typeof raw !== 'string') return { ok: false, code: 'type' }
  const v = field.validation
  if (v?.minLength !== undefined && raw.length < v.minLength)
    return { ok: false, code: 'min_length' }
  if (v?.maxLength !== undefined && raw.length > v.maxLength)
    return { ok: false, code: 'max_length' }
  if (field.type === 'email' && !EMAIL.test(raw)) return { ok: false, code: 'type' }
  if (field.type === 'phone' && raw.replace(/\D/g, '').length < PHONE_DIGITS) {
    return { ok: false, code: 'type' }
  }
  return { ok: true, value: raw }
}

function parseNumeric(field: FormField, raw: unknown): Parsed {
  const kind = field.type as NumberKind
  const text = parseNumberText(raw, kind)
  if (text === null) return { ok: false, code: 'type' }
  const n = Number(text)
  if (field.validation?.min !== undefined && n < field.validation.min)
    return { ok: false, code: 'min' }
  if (field.validation?.max !== undefined && n > field.validation.max)
    return { ok: false, code: 'max' }
  return { ok: true, value: field.type === 'integer' ? n : text }
}

function parseValue(field: FormField, raw: unknown): Parsed {
  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'email':
    case 'phone':
      return parseText(field, raw)
    case 'integer':
    case 'decimal':
    case 'money':
      return parseNumeric(field, raw)
    case 'date':
      return typeof raw === 'string' && parseCivilDate(raw).ok
        ? { ok: true, value: raw }
        : { ok: false, code: 'type' }
    case 'select':
    case 'multiselect':
      return parseSelect(field, raw)
    case 'checkbox':
      return { ok: true, value: raw === true || raw === 'true' || raw === 'on' }
  }
}

export function extractFacts(form: FormBody, values: Record<string, FieldValue>): ProjectFacts {
  const facts: ProjectFacts = { classification: null, dwellingUnits: null, afterTheFact: false }
  for (const field of form.fields) {
    const value = values[field.key]
    if (value === undefined) continue
    if (
      field.fact === 'classification' &&
      (value === 'residential' || value === 'nonresidential')
    ) {
      facts.classification = value
    }
    if (field.fact === 'dwellingUnits' && typeof value === 'number') facts.dwellingUnits = value
    if (field.fact === 'afterTheFact') facts.afterTheFact = value === true
  }
  return facts
}

function isShown(field: FormField, values: Record<string, FieldValue>): boolean {
  return field.showIf === undefined || evaluateCondition(field.showIf, values)
}

function isRequired(field: FormField, values: Record<string, FieldValue>): boolean {
  return (
    field.required || (field.requireIf !== undefined && evaluateCondition(field.requireIf, values))
  )
}

function validateField(
  field: FormField,
  input: unknown,
  values: Record<string, FieldValue>,
  opts: { asStaff: boolean; partial: boolean },
): { error: FieldError } | { value: FieldValue } | null {
  const blank = isBlank(input) || (field.type === 'checkbox' && input === false)
  if (field.staffOnly === true && !opts.asStaff) {
    return blank ? null : { error: { field: field.key, code: 'staff_only' } }
  }
  if (blank && !opts.partial && isRequired(field, values))
    return { error: { field: field.key, code: 'required' } }
  if (blank && field.type !== 'checkbox') return null
  const parsed = parseValue(field, input)
  return parsed.ok ? { value: parsed.value } : { error: { field: field.key, code: parsed.code } }
}

export function validateSubmission(
  form: FormBody,
  raw: Record<string, unknown>,
  opts: { asStaff: boolean; partial?: boolean },
): Result<{ values: Record<string, FieldValue>; facts: ProjectFacts }, FieldError[]> {
  const values: Record<string, FieldValue> = {}
  const errors: FieldError[] = []
  for (const field of form.fields) {
    if (!isShown(field, values)) continue
    const outcome = validateField(field, raw[field.key], values, {
      asStaff: opts.asStaff,
      partial: opts.partial === true,
    })
    if (outcome === null) continue
    if ('error' in outcome) errors.push(outcome.error)
    else values[field.key] = outcome.value
  }
  if (errors.length > 0) return err(errors)
  return ok({ values, facts: extractFacts(form, values) })
}
