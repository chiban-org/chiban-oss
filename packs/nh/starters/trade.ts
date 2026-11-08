import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import { doc } from '@packs/nh/starters/documentQuestions'
import type { StarterBundle } from '@packs/nh/starters/types'
import { ATTESTATION_TEXT } from '@packs/nh/starters/types'
import type { FormField } from '@/features/forms/formSchema'

const TRADE_BINDINGS =
  NH_CLASSIFICATIONS.find((c) => c.key === 'nh.trade_permit')?.mandatoryRuleKeys ?? []

interface TradeInput {
  id: string
  prefix: string
  slug: string
  label: string
  extraField: FormField
  conditionText: string
  affidavit: { label: string; help: string }
}

const BY_CONTRACTOR = { field: 'work_by', op: 'not_equals', value: 'owner' } as const

const WORK_BY: FormField = {
  key: 'work_by',
  label: 'Who is doing the work?',
  type: 'select',
  required: false,
  options: [
    { value: 'contractor', label: 'A licensed contractor' },
    { value: 'owner', label: 'The property owner' },
  ],
}

export function tradeStarter(input: TradeInput): StarterBundle {
  const { prefix, slug, label } = input
  const checklistKeys = [`${slug}-rough`, `${slug}-final`]
  return {
    id: input.id,
    version: 3,
    form: {
      key: `${slug}-form`,
      label: `${label} permit application`,
      fields: [
        { key: 'description', label: 'Description of work', type: 'textarea', required: true },
        WORK_BY,
        {
          key: 'contractor_license_number',
          label: 'Contractor license number',
          type: 'text',
          required: false,
          showIf: BY_CONTRACTOR,
          requireIf: BY_CONTRACTOR,
        },
        input.extraField,
        {
          key: 'after_the_fact',
          label: 'Work started before permit',
          type: 'checkbox',
          required: false,
          fact: 'afterTheFact',
          staffOnly: true,
        },
      ],
    },
    feeSchedule: {
      key: `${slug}-fees`,
      lines: [
        {
          code: slug,
          label: `${label} permit fee`,
          due: 'at_intake',
          expr: {
            op: 'conditional_multiplier',
            when: { field: 'after_the_fact', op: 'is_true' },
            factor: 2,
            of: { op: 'flat', cents: 4500 },
          },
        },
      ],
    },
    conditionLibrary: {
      key: `${slug}-conditions`,
      conditions: [{ code: 'LICENSE', text: input.conditionText, blocksIssuance: true }],
    },
    checklists: [
      {
        key: checklistKeys[0] ?? '',
        inspectionType: 'rough',
        label: `${label} rough inspection`,
        final: false,
        items: [{ key: 'rough-1', label: 'Rough-in installed and accessible', required: true }],
      },
      {
        key: checklistKeys[1] ?? '',
        inspectionType: 'final',
        label: `${label} final inspection`,
        final: true,
        items: [{ key: 'final-1', label: 'Installation complete and operable', required: true }],
      },
    ],
    templates: [
      {
        key: `${slug}-permit`,
        label: `${label} permit`,
        kind: 'permit',
        body: `{{town.name}} ${label} Permit {{application.number}}. Parcel {{parcel.displayId}}, {{parcel.siteAddress}}. Contractor {{party.contractor.name}}. Issued {{application.issuedOn}}. Conditions: {{conditions.list}}. Fees: {{fees.totalFormatted}}.`,
      },
    ],
    applicationType: {
      key: prefix,
      label: `${label} permit`,
      prefix,
      classification: 'nh.trade_permit',
      formKey: `${slug}-form`,
      feeScheduleKey: `${slug}-fees`,
      conditionLibraryKey: `${slug}-conditions`,
      checklistKeys,
      templateKeys: [`${slug}-permit`],
      payTiming: 'at_intake',
      attestationText: ATTESTATION_TEXT,
      bindings: [...TRADE_BINDINGS],
      workflow: { allowsDirectIssue: true, substeps: [], closesOn: 'final_inspection_passed' },
      documents: [
        doc('homeowner_affidavit', input.affidavit.label, {
          help: input.affidavit.help,
          requiredIf: { field: 'work_by', op: 'equals', value: 'owner' },
        }),
      ],
    },
  }
}
