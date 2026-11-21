import { ME_CLASSIFICATIONS } from '@packs/me/classifications'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { DocumentItem } from '@/features/applications/documentItemSchema'
import type { ConditionLibraryBody } from '@/features/conditions/conditionSchema'
import type { FeeExpr, FeeScheduleBody } from '@/features/fees/feeSchema'
import type { Condition, Leaf } from '@/features/forms/condition'
import type { FormField } from '@/features/forms/formSchema'
import type { ChecklistBody } from '@/features/inspections/checklistSchema'
import type { StarterBundle } from '@/features/packs/schema'
import { ATTESTATION_TEXT } from '@/features/packs/schema'

export const SET_YOUR_FEE = 'Set your fee'

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

export const IS_OWNER: FormField = {
  key: 'is_owner',
  label: 'Are you the property owner?',
  type: 'select',
  required: false,
  options: YES_NO,
}

export const PUBLIC_SEWER: FormField = {
  key: 'public_sewer',
  label: 'Is the lot served by a public sewer?',
  type: 'select',
  required: false,
  options: YES_NO,
}

export const AFTER_THE_FACT: FormField = {
  key: 'after_the_fact',
  label: 'Work started before permit',
  type: 'checkbox',
  required: false,
  fact: 'afterTheFact',
  staffOnly: true,
}

export const NOT_OWNER: Condition = {
  field: 'is_owner',
  op: 'equals',
  value: 'no',
}

export function yesBox(key: string, label: string): FormField {
  return { key, label, type: 'checkbox', required: false }
}

export function countField(key: string, label: string): FormField {
  return {
    key,
    label,
    type: 'integer',
    required: false,
    validation: { min: 0 },
  }
}

export function when(field: string): Leaf {
  return { field, op: 'is_true' }
}

export function doc(
  key: string,
  label: string,
  rest: Partial<Omit<DocumentItem, 'key' | 'label'>> = {},
): DocumentItem {
  return { key, label, stage: 'to_file', waivable: false, ...rest }
}

export const OWNER_AUTHORIZATION = doc('owner_authorization_letter', 'Owner authorization', {
  help: 'A signed letter from the owner allowing you to apply.',
  requiredIf: NOT_OWNER,
})

export const PLOT_PLAN = doc('plot_plan', 'Plot plan', {
  help: 'Show lot lines, buildings, setbacks, wetlands and any shoreline.',
})

export function bindingsOf(classification: string): string[] {
  return [...(ME_CLASSIFICATIONS.find((c) => c.key === classification)?.mandatoryRuleKeys ?? [])]
}

export function lateDoubled(expr: FeeExpr): FeeExpr {
  return {
    op: 'conditional_multiplier',
    when: { field: 'after_the_fact', op: 'is_true' },
    factor: 2,
    of: expr,
  }
}

export function perCount(field: string, centsPerUnit: number): FeeExpr {
  return { op: 'per_unit', source: { kind: 'field', field }, centsPerUnit }
}

export function setYourFeeLine(
  code: string,
  label: string,
  due: FeeScheduleBody['lines'][number]['due'],
): FeeScheduleBody['lines'][number] {
  return {
    code,
    label: `${label} (${SET_YOUR_FEE})`,
    due,
    expr: { op: 'flat', cents: 0 },
  }
}

export function denialLetter(slug: string, label: string) {
  return {
    key: `${slug}-denial`,
    label: `${label} denial letter`,
    kind: 'letter' as const,
    body: `{{town.name}}\n\nDear {{party.applicant.name}}:\n\nYour application {{application.number}}, ${label.toLowerCase()}, for parcel {{parcel.displayId}}, {{parcel.siteAddress}}, is denied.\n\nThe reasons for the denial are: ____\n\nPlease ask the town office how this decision may be appealed and the time allowed to appeal.`,
  }
}

export interface PermitStarterInput {
  id: string
  prefix: string
  slug: string
  label: string
  classification: string
  payTiming: ApplicationTypeBody['payTiming']
  allowsDirectIssue: boolean
  fields: FormField[]
  feeLines: FeeScheduleBody['lines']
  conditions: ConditionLibraryBody['conditions']
  checklists?: ChecklistBody[]
  documents: DocumentItem[]
  substeps?: ApplicationTypeBody['workflow']['substeps']
  closesOn: ApplicationTypeBody['workflow']['closesOn']
  permitDetails: string
}

export function permitStarter(input: PermitStarterInput): StarterBundle {
  const { prefix, slug, label } = input
  const checklists = input.checklists ?? []
  const templates = [
    {
      key: `${slug}-permit`,
      label,
      kind: 'permit' as const,
      body: `{{town.name}} ${label} {{application.number}}. Parcel {{parcel.displayId}}, {{parcel.siteAddress}}. Owner {{parcel.ownerName}}. ${input.permitDetails} Conditions: {{conditions.list}}. Fees: {{fees.totalFormatted}}.`,
    },
    denialLetter(slug, label),
  ]
  return {
    id: input.id,
    version: 1,
    form: {
      key: `${slug}-form`,
      label: `${label} application`,
      fields: [
        {
          key: 'description',
          label: 'Description of the work',
          type: 'textarea',
          required: true,
        },
        ...input.fields,
      ],
    },
    feeSchedule: { key: `${slug}-fees`, lines: input.feeLines },
    conditionLibrary: {
      key: `${slug}-conditions`,
      conditions: input.conditions,
    },
    checklists,
    templates,
    applicationType: {
      key: prefix,
      label,
      prefix,
      classification: input.classification,
      formKey: `${slug}-form`,
      feeScheduleKey: `${slug}-fees`,
      conditionLibraryKey: `${slug}-conditions`,
      checklistKeys: checklists.map((c) => c.key),
      templateKeys: templates.map((t) => t.key),
      payTiming: input.payTiming,
      attestationText: ATTESTATION_TEXT,
      bindings: bindingsOf(input.classification),
      workflow: {
        allowsDirectIssue: input.allowsDirectIssue,
        substeps: input.substeps ?? [],
        closesOn: input.closesOn,
      },
      documents: input.documents,
    },
  }
}

export interface ChecklistInput {
  slug: string
  inspectionType: string
  label: string
  items: readonly string[]
  final: boolean
}

export function checklist(input: ChecklistInput): ChecklistBody {
  const { slug, inspectionType } = input
  return {
    key: `${slug}-${inspectionType.replaceAll('_', '-')}`,
    inspectionType,
    label: input.label,
    final: input.final,
    items: input.items.map((item, i) => ({
      key: `${inspectionType}-${i + 1}`,
      label: item,
      required: true,
    })),
  }
}

export function startOfWorkChecklist(slug: string): ChecklistBody {
  return checklist({
    slug,
    inspectionType: 'start_of_work',
    label: 'Start of work (Chiban starting checklist, the town can edit it)',
    items: ['Work authorized by the permit has begun on site'],
    final: true,
  })
}
