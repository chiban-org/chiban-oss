import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import {
  BUILDING_DOCUMENT_QUESTIONS,
  BUILDING_DOCUMENTS,
} from '@packs/nh/starters/buildingDocuments'
import type { StarterBundle } from '@packs/nh/starters/types'
import { ATTESTATION_TEXT } from '@packs/nh/starters/types'

const BUILDING_BINDINGS =
  NH_CLASSIFICATIONS.find((c) => c.key === 'nh.building_permit')?.mandatoryRuleKeys ?? []

const isResidential = { field: 'classification', op: 'equals', value: 'residential' } as const
const isNonresidential = { field: 'classification', op: 'equals', value: 'nonresidential' } as const

const INSPECTIONS = [
  ['footing', 'Footing inspection', ['Excavation depth and width', 'Reinforcement placed']],
  ['foundation', 'Foundation inspection', ['Walls and anchor bolts', 'Drainage and damp-proofing']],
  ['framing', 'Framing inspection', ['Structural framing', 'Fire blocking', 'Rough mechanical']],
  ['insulation', 'Insulation inspection', ['Insulation installed', 'Air sealing']],
  ['final', 'Final inspection', ['Work matches approved plans', 'Life-safety items complete']],
] as const

export const BUILDING_DEMOLITION_STARTER: StarterBundle = {
  id: 'nh.starter.building',
  version: 3,
  form: {
    key: 'bp-form',
    label: 'Building or demolition permit application',
    fields: [
      {
        key: 'work_type',
        label: 'Type of work',
        type: 'select',
        required: true,
        options: [
          { value: 'building', label: 'Building' },
          { value: 'demolition', label: 'Demolition' },
        ],
      },
      { key: 'description', label: 'Description of work', type: 'textarea', required: true },
      {
        key: 'classification',
        label: 'Use classification',
        type: 'select',
        required: true,
        fact: 'classification',
        options: [
          { value: 'residential', label: 'Residential' },
          { value: 'nonresidential', label: 'Nonresidential' },
        ],
      },
      {
        key: 'dwelling_units',
        label: 'Number of dwelling units',
        type: 'integer',
        required: false,
        fact: 'dwellingUnits',
        validation: { min: 1 },
        showIf: isResidential,
        requireIf: isResidential,
      },
      {
        key: 'finished_sq_ft',
        label: 'Finished area (sq ft)',
        type: 'decimal',
        required: false,
        validation: { min: 0, max: 10000000 },
      },
      {
        key: 'unfinished_sq_ft',
        label: 'Unfinished area (sq ft)',
        type: 'decimal',
        required: false,
        validation: { min: 0, max: 10000000 },
      },
      {
        key: 'commercial_sq_ft',
        label: 'Commercial area (sq ft)',
        type: 'decimal',
        required: false,
        validation: { min: 0, max: 10000000 },
        showIf: isNonresidential,
      },
      { key: 'estimated_cost', label: 'Estimated cost of work', type: 'money', required: false },
      ...BUILDING_DOCUMENT_QUESTIONS,
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
    key: 'bp-fees',
    lines: [
      {
        code: 'building',
        label: 'Building permit fee',
        due: 'at_approval',
        expr: {
          op: 'conditional_multiplier',
          when: { field: 'after_the_fact', op: 'is_true' },
          factor: 2,
          of: {
            op: 'minimum',
            cents: 4000,
            of: {
              op: 'sum',
              of: [
                {
                  op: 'per_unit',
                  source: { kind: 'field', field: 'finished_sq_ft' },
                  centsPerUnit: 35,
                },
                {
                  op: 'per_unit',
                  source: { kind: 'field', field: 'unfinished_sq_ft' },
                  centsPerUnit: 20,
                },
                {
                  op: 'per_unit',
                  source: { kind: 'field', field: 'commercial_sq_ft' },
                  centsPerUnit: 40,
                },
              ],
            },
          },
        },
      },
      {
        code: 'renewal',
        label: 'Permit renewal fee',
        due: 'at_renewal',
        expr: { op: 'flat', cents: 4500 },
      },
    ],
  },
  conditionLibrary: {
    key: 'bp-conditions',
    conditions: [
      { code: 'ZONING', text: 'Zoning compliance confirmed in writing', blocksIssuance: true },
      {
        code: 'SILT',
        text: 'Erosion and sediment controls in place before excavation',
        blocksIssuance: false,
      },
    ],
  },
  checklists: INSPECTIONS.map(([type, label, items]) => ({
    key: `bp-${type}`,
    inspectionType: type,
    label,
    final: type === 'final',
    items: items.map((item, i) => ({ key: `${type}-${i + 1}`, label: item, required: true })),
  })),
  templates: [
    {
      key: 'bp-permit',
      label: 'Building permit',
      kind: 'permit',
      body: '{{town.name}} Building Permit {{application.number}}. Parcel {{parcel.displayId}}, {{parcel.siteAddress}}. Owner {{parcel.ownerName}}. Project {{project.title}}. Issued {{application.issuedOn}}, exercise by {{application.expiresOn}}. State building code: {{codeEdition.label}}. Conditions: {{conditions.list}}. Fees: {{fees.totalFormatted}}.',
    },
  ],
  applicationType: {
    key: 'BP',
    label: 'Building or demolition permit',
    prefix: 'BP',
    classification: 'nh.building_permit',
    formKey: 'bp-form',
    feeScheduleKey: 'bp-fees',
    conditionLibraryKey: 'bp-conditions',
    checklistKeys: INSPECTIONS.map(([type]) => `bp-${type}`),
    templateKeys: ['bp-permit'],
    payTiming: 'at_approval',
    attestationText: ATTESTATION_TEXT,
    bindings: [...BUILDING_BINDINGS],
    workflow: {
      allowsDirectIssue: false,
      substeps: [
        { state: 'under_review', key: 'plan_review', label: 'Plan review' },
        { state: 'under_review', key: 'zoning_review', label: 'Zoning review' },
        { state: 'issued', key: 'inspections', label: 'Inspections' },
        { state: 'issued', key: 'co_pending', label: 'Certificate of occupancy pending' },
      ],
      closesOn: 'certificate_of_occupancy',
    },
    documents: BUILDING_DOCUMENTS,
  },
}
