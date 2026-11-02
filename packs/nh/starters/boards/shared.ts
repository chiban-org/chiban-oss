import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import type { StarterBundle } from '@packs/nh/starters/types'
import { ATTESTATION_TEXT } from '@packs/nh/starters/types'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'
import type { FormField } from '@/features/forms/formSchema'

export const NOTICE_MAIL_CENTS = 1000
export const NOTICE_NEWSPAPER_CENTS = 7500

export interface BoardStarterInput {
  id: string
  prefix: string
  slug: string
  label: string
  classification: Extract<ApplicationTypeBody['classification'], `nh.${string}`>
  fields: FormField[]
  applicationFee: FeeScheduleBody['lines'][number]['expr']
  newspaper: boolean
  workflow: ApplicationTypeBody['workflow']
}

const SHARED_FIELDS: FormField[] = [
  { key: 'project_description', label: 'Project description', type: 'textarea', required: true },
  {
    key: 'applicant_mailing_address',
    label: 'Applicant mailing address',
    type: 'textarea',
    required: true,
  },
  {
    key: 'owner_authorization',
    label: 'The owner has authorized this application',
    type: 'checkbox',
    required: true,
  },
]

const PLANNING_WORKFLOW: ApplicationTypeBody['workflow'] = {
  allowsDirectIssue: false,
  substeps: [
    { state: 'submitted', key: 'filed', label: 'Filed' },
    { state: 'submitted', key: 'acceptance_scheduled', label: 'Acceptance meeting set' },
    { state: 'under_review', key: 'hearing', label: 'Hearing' },
    { state: 'under_review', key: 'deliberation', label: 'Deliberation' },
    { state: 'decided', key: 'conditions_precedent', label: 'Conditions precedent' },
    { state: 'decided', key: 'certified_by_selectmen', label: 'Certified by the selectmen' },
  ],
  closesOn: 'staff_closes',
}

const ZBA_WORKFLOW: ApplicationTypeBody['workflow'] = {
  allowsDirectIssue: false,
  substeps: [
    { state: 'submitted', key: 'filed', label: 'Filed' },
    { state: 'submitted', key: 'hearing_scheduled', label: 'Hearing set' },
    { state: 'under_review', key: 'hearing', label: 'Hearing' },
    { state: 'under_review', key: 'deliberation', label: 'Deliberation' },
    { state: 'decided', key: 'conditions_precedent', label: 'Conditions precedent' },
  ],
  closesOn: 'staff_closes',
}

export const PLANNING_BOARD_WORKFLOW = PLANNING_WORKFLOW
export const ZBA_BOARD_WORKFLOW = ZBA_WORKFLOW

export function boardStarter(input: BoardStarterInput): StarterBundle {
  const { slug, prefix, label } = input
  const classification = NH_CLASSIFICATIONS.find((c) => c.key === input.classification)
  const lines: FeeScheduleBody['lines'] = [
    { code: 'application', label: 'Application fee', due: 'at_intake', expr: input.applicationFee },
    {
      code: 'notice_mail',
      label: 'Mailed notice to abutters',
      due: 'at_notice',
      expr: {
        op: 'per_unit',
        source: { kind: 'count_of', what: 'abutters_on_issued_list' },
        centsPerUnit: NOTICE_MAIL_CENTS,
      },
    },
    ...(input.newspaper
      ? [
          {
            code: 'notice_newspaper',
            label: 'Published notice',
            due: 'at_notice' as const,
            expr: { op: 'flat' as const, cents: NOTICE_NEWSPAPER_CENTS },
          },
        ]
      : []),
  ]
  return {
    id: input.id,
    version: 1,
    form: {
      key: `${slug}-form`,
      label: `${label} application`,
      fields: [...SHARED_FIELDS, ...input.fields],
    },
    feeSchedule: { key: `${slug}-fees`, lines },
    conditionLibrary: {
      key: `${slug}-conditions`,
      conditions: [
        { code: 'CONDITIONS_MET', text: 'Conditions of approval completed', blocksIssuance: false },
      ],
    },
    checklists: [],
    templates: [
      {
        key: `${slug}-decision`,
        label: `${label} notice of decision`,
        kind: 'letter',
        body: `{{town.name}} notice of decision on {{application.typeLabel}} {{application.number}}, {{project.title}}, parcel {{parcel.displayId}}, {{parcel.siteAddress}}. Applicant {{party.applicant.name}}. Conditions: {{conditions.list}}.`,
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
      checklistKeys: [],
      templateKeys: [`${slug}-decision`],
      payTiming: 'at_intake',
      attestationText: ATTESTATION_TEXT,
      bindings: [...(classification?.mandatoryRuleKeys ?? [])],
      workflow: input.workflow,
    },
  }
}

export function perLot(baseCents: number): FeeScheduleBody['lines'][number]['expr'] {
  return {
    op: 'sum',
    of: [
      { op: 'flat', cents: baseCents },
      { op: 'per_unit', source: { kind: 'field', field: 'lot_count' }, centsPerUnit: 5000 },
    ],
  }
}
