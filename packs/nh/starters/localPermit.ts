import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import type { StarterBundle } from '@packs/nh/starters/types'
import { ATTESTATION_TEXT } from '@packs/nh/starters/types'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { FormField } from '@/features/forms/formSchema'
import type { ChecklistBody } from '@/features/inspections/checklistSchema'

type Classification = NonNullable<ApplicationTypeBody['classification']>

export interface LocalPermitInput {
  id: string
  prefix: string
  slug: string
  label: string
  classification: Classification
  payTiming: 'at_intake' | 'at_approval'
  allowsDirectIssue: boolean
  feeCents: number
  doublesAfterTheFact?: boolean
  fields?: FormField[]
  conditionText: string
  checklist?: ChecklistBody
  closesOn: ApplicationTypeBody['workflow']['closesOn']
  extraBindings?: string[]
  validityPhrase?: string
}

const AFTER_THE_FACT: FormField = {
  key: 'after_the_fact',
  label: 'Work started before permit',
  type: 'checkbox',
  required: false,
  fact: 'afterTheFact',
  staffOnly: true,
}

export function localPermitStarter(input: LocalPermitInput): StarterBundle {
  const { prefix, slug, label } = input
  const mandatory =
    NH_CLASSIFICATIONS.find((c) => c.key === input.classification)?.mandatoryRuleKeys ?? []
  const checklists = input.checklist === undefined ? [] : [input.checklist]
  const flat = { op: 'flat', cents: input.feeCents } as const
  const closing = input.validityPhrase ?? 'Issued {{application.issuedOn}}.'
  return {
    id: input.id,
    version: 1,
    form: {
      key: `${slug}-form`,
      label: `${label} application`,
      fields: [
        { key: 'description', label: 'Description', type: 'textarea', required: true },
        ...(input.fields ?? []),
        ...(input.doublesAfterTheFact === true ? [AFTER_THE_FACT] : []),
      ],
    },
    feeSchedule: {
      key: `${slug}-fees`,
      lines: [
        {
          code: slug,
          label: `${label} fee`,
          due: input.payTiming,
          expr:
            input.doublesAfterTheFact === true
              ? {
                  op: 'conditional_multiplier',
                  when: { field: 'after_the_fact', op: 'is_true' },
                  factor: 2,
                  of: flat,
                }
              : flat,
        },
      ],
    },
    conditionLibrary: {
      key: `${slug}-conditions`,
      conditions: [{ code: 'CONFIRMED', text: input.conditionText, blocksIssuance: true }],
    },
    checklists,
    templates: [
      {
        key: `${slug}-permit`,
        label,
        kind: 'permit',
        body: `{{town.name}} ${label} {{application.number}}. Parcel {{parcel.displayId}}, {{parcel.siteAddress}}. Applicant {{party.applicant.name}}. ${closing} Conditions: {{conditions.list}}. Fees: {{fees.totalFormatted}}.`,
      },
    ],
    applicationType: {
      key: prefix,
      label,
      prefix,
      classification: input.classification,
      formKey: `${slug}-form`,
      feeScheduleKey: `${slug}-fees`,
      conditionLibraryKey: `${slug}-conditions`,
      checklistKeys: checklists.map((c) => c.key),
      templateKeys: [`${slug}-permit`],
      payTiming: input.payTiming,
      attestationText: ATTESTATION_TEXT,
      bindings: [...new Set([...mandatory, ...(input.extraBindings ?? [])])],
      workflow: {
        allowsDirectIssue: input.allowsDirectIssue,
        substeps: [],
        closesOn: input.closesOn,
      },
    },
  }
}

export const REGISTRATION_BINDINGS = ['town.registration.validity', 'town.registration.expiration']
export const TEMPORARY_BINDINGS = ['town.temporary.validity', 'town.temporary.expiration']
