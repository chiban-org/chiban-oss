import type { DocumentItem } from '@/features/applications/documentItemSchema'
import { AFTER_THE_FACT_FIELD } from '@/features/fees/feeEditorModel'
import { exprFieldRefs, type FeeExpr, type FeeScheduleBody } from '@/features/fees/feeSchema'
import { conditionFields } from '@/features/forms/condition'
import type { FormBody, FormField } from '@/features/forms/formSchema'

export const LICENSE_FIELD = 'contractor_license_number'

export interface FieldReference {
  source: string
  detail: string
}

export interface ExternalUse extends FieldReference {
  fieldKey: string
}

export interface FormBuilderData {
  frozenKeys: string[]
  externalUses: ExternalUse[]
}

export const NO_FORM_BUILDER_DATA: FormBuilderData = { frozenKeys: [], externalUses: [] }

export interface FormUsingType {
  key: string
  label: string
  formKey: string
  feeScheduleKey: string
  documents?: DocumentItem[]
}

const KEYS_READ_BY_CODE: Readonly<Record<string, FieldReference>> = {
  [LICENSE_FIELD]: {
    source: 'Counter, permit and import',
    detail:
      'The counter fills this answer from the license check, and the permit and record import read it.',
  },
  [AFTER_THE_FACT_FIELD]: {
    source: 'Fee editor',
    detail: 'The “work started before the permit” fee multiplier reads this answer.',
  },
}

const FACT_WORDS: Record<NonNullable<FormField['fact']>, string> = {
  classification: 'Supplies the use classification that deadlines and certificates rely on.',
  dwellingUnits: 'Supplies the number of dwelling units that fees and deadlines rely on.',
  afterTheFact: 'Records whether work started before the permit.',
}

function multiplierRefs(expr: FeeExpr): string[] {
  if (expr.op === 'conditional_multiplier') {
    return [...conditionFields(expr.when), ...multiplierRefs(expr.of)]
  }
  if (expr.op === 'minimum') return multiplierRefs(expr.of)
  if (expr.op === 'sum') return expr.of.flatMap(multiplierRefs)
  return []
}

export function feeFieldRefs(expr: FeeExpr): string[] {
  return [...new Set([...multiplierRefs(expr), ...exprFieldRefs(expr)])]
}

function documentUses(type: FormUsingType): ExternalUse[] {
  return (type.documents ?? []).flatMap((item) =>
    item.requiredIf === undefined
      ? []
      : conditionFields(item.requiredIf).map((fieldKey) => ({
          fieldKey,
          source: `Required documents (${type.label})`,
          detail: `${item.label} is needed only when this answer matches`,
        })),
  )
}

export function externalUses(
  formKey: string,
  types: readonly FormUsingType[],
  feeSchedules: readonly { key: string; body: FeeScheduleBody }[],
): ExternalUse[] {
  const uses: ExternalUse[] = []
  for (const type of types.filter((t) => t.formKey === formKey)) {
    const fees = feeSchedules.find((f) => f.key === type.feeScheduleKey)
    for (const line of fees?.body.lines ?? []) {
      for (const fieldKey of feeFieldRefs(line.expr)) {
        uses.push({
          fieldKey,
          source: `Fee schedule ${fees?.key} (${type.label})`,
          detail: line.label,
        })
      }
    }
    uses.push(...documentUses(type))
  }
  return uses
}

function ruleNames(field: FormField, key: string): string[] {
  const names: string[] = []
  if (field.showIf !== undefined && conditionFields(field.showIf).includes(key)) {
    names.push('Show only when')
  }
  if (field.requireIf !== undefined && conditionFields(field.requireIf).includes(key)) {
    names.push('Required only when')
  }
  return names
}

export function referencesTo(
  body: FormBody,
  index: number,
  external: readonly ExternalUse[],
): FieldReference[] {
  const field = body.fields[index]
  if (field === undefined) return []
  const fromQuestions = body.fields.flatMap((other, i) => {
    const names = i === index ? [] : ruleNames(other, field.key)
    return names.length === 0
      ? []
      : [{ source: `Question “${other.label}”`, detail: names.join(' and ') }]
  })
  const fromConfig = external
    .filter((use) => use.fieldKey === field.key)
    .map(({ source, detail }) => ({ source, detail }))
  const fromCode = KEYS_READ_BY_CODE[field.key]
  const fact =
    field.fact === undefined ? [] : [{ source: 'Project facts', detail: FACT_WORDS[field.fact] }]
  return [...fromQuestions, ...fromConfig, ...(fromCode === undefined ? [] : [fromCode]), ...fact]
}
