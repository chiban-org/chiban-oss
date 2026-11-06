import { addDays, type CivilDate } from '@/types/civilDate'
import type { Fields } from './form'

export type VariantKind =
  | 'missing'
  | 'whitespace'
  | 'too_long'
  | 'below_min'
  | 'above_max'
  | 'fraction'
  | 'words'
  | 'impossible_date'
  | 'too_early'
  | 'too_late'
  | 'not_a_choice'
  | 'letters'
  | 'too_few_digits'
  | 'sub_cent'
  | 'negative'

export interface FieldSpec {
  readonly required: boolean
  readonly variants: readonly { kind: VariantKind; label: string; value: string }[]
}

export interface InvalidVariant {
  field: string
  kind: VariantKind
  title: string
  apply(input: Fields): Fields
}

interface Required {
  required?: boolean
}

function spec(options: Required, variants: FieldSpec['variants']): FieldSpec {
  return { required: options.required === true, variants }
}

export function text(options: Required & { max?: number } = {}): FieldSpec {
  const blank =
    options.required === true
      ? [{ kind: 'whitespace' as const, label: 'as whitespace only', value: '   ' }]
      : []
  const long =
    options.max === undefined
      ? []
      : [
          {
            kind: 'too_long' as const,
            label: `longer than ${options.max} characters`,
            value: 'x'.repeat(options.max + 1),
          },
        ]
  return spec(options, [...blank, ...long])
}

export function int(options: Required & { min?: number; max?: number } = {}): FieldSpec {
  const below =
    options.min === undefined
      ? []
      : [
          {
            kind: 'below_min' as const,
            label: `below ${options.min}`,
            value: String(options.min - 1),
          },
        ]
  const above =
    options.max === undefined
      ? []
      : [
          {
            kind: 'above_max' as const,
            label: `above ${options.max}`,
            value: String(options.max + 1),
          },
        ]
  return spec(options, [
    ...below,
    ...above,
    { kind: 'fraction', label: 'as a fraction', value: '1.5' },
    { kind: 'words', label: 'as words', value: 'thirty' },
  ])
}

export function date(options: Required & { earliest?: string; latest?: string } = {}): FieldSpec {
  const { earliest, latest } = options
  const early =
    earliest === undefined
      ? []
      : [
          {
            kind: 'too_early' as const,
            label: `before ${earliest}`,
            value: addDays(earliest as CivilDate, -1),
          },
        ]
  const late =
    latest === undefined
      ? []
      : [
          {
            kind: 'too_late' as const,
            label: `after ${latest}`,
            value: addDays(latest as CivilDate, 1),
          },
        ]
  return spec(options, [
    { kind: 'impossible_date', label: 'as an impossible date', value: '2027-02-30' },
    { kind: 'words', label: 'as words', value: 'next Tuesday' },
    ...early,
    ...late,
  ])
}

export function phone(options: Required = {}): FieldSpec {
  return spec(options, [
    { kind: 'letters', label: 'as letters', value: 'abc' },
    { kind: 'too_few_digits', label: 'with too few digits', value: '555-014' },
  ])
}

export function money(options: Required & { min?: number } = {}): FieldSpec {
  const min = options.min ?? 1
  return spec(options, [
    {
      kind: 'below_min',
      label: `below ${(min / 100).toFixed(2)}`,
      value: ((min - 1) / 100).toFixed(2),
    },
    { kind: 'sub_cent', label: 'with a fraction of a cent', value: '1.005' },
    { kind: 'negative', label: 'as a negative amount', value: '-5' },
    { kind: 'words', label: 'as words', value: 'abc' },
  ])
}

export function uuid(options: Required = {}): FieldSpec {
  return spec(options, [{ kind: 'words', label: 'as words', value: 'not-a-uuid' }])
}

export function choice(options: Required = {}): FieldSpec {
  return spec(options, [
    { kind: 'not_a_choice', label: 'outside its choices', value: 'not-a-choice' },
  ])
}

export function invalidVariants(fields: Readonly<Record<string, FieldSpec>>): InvalidVariant[] {
  return Object.entries(fields).flatMap(([field, fieldSpec]) => {
    const missing: InvalidVariant[] = fieldSpec.required
      ? [
          {
            field,
            kind: 'missing',
            title: `${field} left out`,
            apply: (input) => ({ ...input, [field]: undefined }),
          },
        ]
      : []
    const others = fieldSpec.variants.map(
      (v): InvalidVariant => ({
        field,
        kind: v.kind,
        title: `${field} ${v.label}`,
        apply: (input) => ({ ...input, [field]: v.value }),
      }),
    )
    return [...missing, ...others]
  })
}
