import { bindingsOf, IS_OWNER, SET_YOUR_FEE, setYourFeeLine } from '@packs/me/starters/permitParts'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { DocumentItem } from '@/features/applications/documentItemSchema'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'
import type { FormField } from '@/features/forms/formSchema'
import type { StarterBundle } from '@/features/packs/schema'
import { ATTESTATION_TEXT } from '@/features/packs/schema'
import {
  DECISION_LETTER_TEXT,
  NOTICE_OF_DECISION_TEXT,
} from '@/features/templates/kinds/boardLetterTexts'
import type { TextTemplateBody } from '@/features/templates/templateSchema'

export const ME_HEARING_NOTICE_TEXT =
  '{{town.name}}\n\n{{notice.recipientName}}\n\n{{notice.recipientAddress}}\n\nNotice of {{hearing.kind}}\n\nThe {{board.name}} will hold a {{hearing.kind}} on {{meeting.date}} at {{meeting.time}}, {{meeting.location}}, on {{application.typeLabel}} {{application.number}}, {{project.title}}, parcel {{parcel.displayId}}, {{parcel.siteAddress}}. Applicant {{party.applicant.name}}.\n\nYou are receiving this notice as an abutting property owner or a party to the application. Anyone interested may speak at the hearing. The application may be reviewed at the town office.'

export interface BoardStarterInput {
  id: string
  prefix: string
  slug: string
  label: string
  classification: string
  fields: FormField[]
  noticeLine: FeeScheduleBody['lines'][number]
  workflow: ApplicationTypeBody['workflow']
  documents: DocumentItem[]
  extraTemplates?: TextTemplateBody[]
}

const SHARED_FIELDS: FormField[] = [
  {
    key: 'project_description',
    label: 'Project description',
    type: 'textarea',
    required: true,
  },
  {
    key: 'applicant_name',
    label: 'Applicant name',
    type: 'text',
    required: true,
  },
  {
    key: 'applicant_mailing_address',
    label: 'Applicant mailing address',
    type: 'textarea',
    required: true,
  },
  IS_OWNER,
  {
    key: 'owner_authorization',
    label: 'The owner has authorized this application',
    type: 'checkbox',
    required: true,
  },
]

export const PLANNING_BOARD_WORKFLOW: ApplicationTypeBody['workflow'] = {
  allowsDirectIssue: false,
  substeps: [
    { state: 'submitted', key: 'filed', label: 'Filed' },
    {
      state: 'submitted',
      key: 'acceptance_scheduled',
      label: 'Completeness review set',
    },
    { state: 'under_review', key: 'hearing', label: 'Hearing' },
    { state: 'under_review', key: 'deliberation', label: 'Deliberation' },
    {
      state: 'decided',
      key: 'conditions_precedent',
      label: 'Conditions precedent',
    },
  ],
  closesOn: 'staff_closes',
}

export const BOARD_OF_APPEALS_WORKFLOW: ApplicationTypeBody['workflow'] = {
  allowsDirectIssue: false,
  substeps: [
    { state: 'submitted', key: 'filed', label: 'Filed' },
    { state: 'submitted', key: 'hearing_scheduled', label: 'Hearing set' },
    { state: 'under_review', key: 'hearing', label: 'Hearing' },
    { state: 'under_review', key: 'deliberation', label: 'Deliberation' },
    {
      state: 'decided',
      key: 'conditions_precedent',
      label: 'Conditions precedent',
    },
  ],
  closesOn: 'staff_closes',
}

export const ABUTTER_NOTICE_LINE: FeeScheduleBody['lines'][number] = {
  code: 'notice_mail',
  label: `Mailed notice to abutters (${SET_YOUR_FEE})`,
  due: 'at_notice',
  expr: {
    op: 'per_unit',
    source: { kind: 'count_of', what: 'abutters_on_issued_list' },
    centsPerUnit: 0,
  },
}

function boardTemplates(slug: string, label: string): TextTemplateBody[] {
  return [
    {
      key: `${slug}-hearing-notice`,
      label: `${label} hearing notice`,
      kind: 'hearing_notice',
      body: ME_HEARING_NOTICE_TEXT,
    },
    {
      key: `${slug}-notice-of-decision`,
      label: `${label} notice of decision`,
      kind: 'notice_of_decision',
      body: NOTICE_OF_DECISION_TEXT,
    },
    {
      key: `${slug}-decision-letter`,
      label: `${label} decision letter`,
      kind: 'decision_letter',
      body: DECISION_LETTER_TEXT,
    },
    {
      key: `${slug}-decision`,
      label: `${label} decision notice letter`,
      kind: 'letter',
      body: `{{town.name}} notice of decision on {{application.typeLabel}} {{application.number}}, {{project.title}}, parcel {{parcel.displayId}}, {{parcel.siteAddress}}. Applicant {{party.applicant.name}}. Conditions: {{conditions.list}}.`,
    },
  ]
}

export function boardStarter(input: BoardStarterInput): StarterBundle {
  const { slug, prefix, label } = input
  const templates = [...boardTemplates(slug, label), ...(input.extraTemplates ?? [])]
  return {
    id: input.id,
    version: 1,
    form: {
      key: `${slug}-form`,
      label: `${label} application`,
      fields: [...SHARED_FIELDS, ...input.fields],
    },
    feeSchedule: {
      key: `${slug}-fees`,
      lines: [setYourFeeLine('application', 'Application fee', 'at_intake'), input.noticeLine],
    },
    conditionLibrary: {
      key: `${slug}-conditions`,
      conditions: [
        {
          code: 'CONDITIONS_MET',
          text: 'Conditions of approval completed',
          blocksIssuance: false,
        },
      ],
    },
    checklists: [],
    templates,
    applicationType: {
      key: prefix,
      label,
      prefix,
      classification: input.classification,
      formKey: `${slug}-form`,
      feeScheduleKey: `${slug}-fees`,
      conditionLibraryKey: `${slug}-conditions`,
      checklistKeys: [],
      templateKeys: templates.map((t) => t.key),
      payTiming: 'at_intake',
      attestationText: ATTESTATION_TEXT,
      bindings: bindingsOf(input.classification),
      workflow: input.workflow,
      documents: input.documents,
    },
  }
}
