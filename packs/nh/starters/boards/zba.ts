import { boardStarter, ZBA_BOARD_WORKFLOW } from '@packs/nh/starters/boards/shared'

const ORDINANCE_SECTION = {
  key: 'ordinance_section',
  label: 'Ordinance section',
  type: 'text',
  required: true,
} as const

export const VARIANCE_STARTER = boardStarter({
  id: 'nh.starter.zba_variance',
  prefix: 'VAR',
  slug: 'var',
  label: 'Variance',
  classification: 'nh.zba_variance',
  fields: [
    ORDINANCE_SECTION,
    { key: 'relief_requested', label: 'Relief requested', type: 'textarea', required: true },
    {
      key: 'criterion_public_interest',
      label: 'The variance will not be contrary to the public interest',
      type: 'textarea',
      required: true,
    },
    {
      key: 'criterion_spirit_of_ordinance',
      label: 'The spirit of the ordinance is observed',
      type: 'textarea',
      required: true,
    },
    {
      key: 'criterion_substantial_justice',
      label: 'Substantial justice is done',
      type: 'textarea',
      required: true,
    },
    {
      key: 'criterion_surrounding_values',
      label: 'The values of surrounding properties are not diminished',
      type: 'textarea',
      required: true,
    },
    {
      key: 'criterion_hardship',
      label: 'Denial would result in unnecessary hardship',
      type: 'textarea',
      required: true,
    },
  ],
  applicationFee: { op: 'flat', cents: 15000 },
  newspaper: true,
  workflow: ZBA_BOARD_WORKFLOW,
})

export const SPECIAL_EXCEPTION_STARTER = boardStarter({
  id: 'nh.starter.zba_special_exception',
  prefix: 'SE',
  slug: 'se',
  label: 'Special exception',
  classification: 'nh.zba_special_exception',
  fields: [
    ORDINANCE_SECTION,
    {
      key: 'criteria_response',
      label: 'How the application meets the ordinance criteria',
      type: 'textarea',
      required: true,
    },
  ],
  applicationFee: { op: 'flat', cents: 15000 },
  newspaper: true,
  workflow: ZBA_BOARD_WORKFLOW,
})

export const EQUITABLE_WAIVER_STARTER = boardStarter({
  id: 'nh.starter.zba_equitable_waiver',
  prefix: 'EW',
  slug: 'ew',
  label: 'Equitable waiver of dimensional requirement',
  classification: 'nh.zba_equitable_waiver',
  fields: [
    {
      key: 'violation_discovered_on',
      label: 'Date the violation was discovered',
      type: 'date',
      required: true,
    },
    {
      key: 'dimension_in_violation',
      label: 'Dimensional requirement in violation',
      type: 'text',
      required: true,
    },
  ],
  applicationFee: { op: 'flat', cents: 15000 },
  newspaper: true,
  workflow: ZBA_BOARD_WORKFLOW,
})

export const ADMINISTRATIVE_APPEAL_STARTER = boardStarter({
  id: 'nh.starter.zba_administrative_appeal',
  prefix: 'AAD',
  slug: 'aad',
  label: 'Appeal of administrative decision',
  classification: 'nh.zba_administrative_appeal',
  fields: [
    { key: 'decision_appealed', label: 'Decision appealed', type: 'text', required: true },
    { key: 'decision_date', label: 'Date of the decision', type: 'date', required: true },
    { key: 'grounds', label: 'Grounds for the appeal', type: 'textarea', required: true },
  ],
  applicationFee: { op: 'flat', cents: 10000 },
  newspaper: true,
  workflow: ZBA_BOARD_WORKFLOW,
})

export const REHEARING_MOTION_STARTER = boardStarter({
  id: 'nh.starter.zba_rehearing_motion',
  prefix: 'RH',
  slug: 'rh',
  label: 'Motion for rehearing',
  classification: 'nh.zba_rehearing_motion',
  fields: [
    {
      key: 'decision_application_number',
      label: 'Number of the application decided',
      type: 'text',
      required: true,
    },
    { key: 'vote_date', label: 'Date of the vote', type: 'date', required: true },
    { key: 'grounds', label: 'Grounds for rehearing', type: 'textarea', required: true },
  ],
  applicationFee: { op: 'flat', cents: 0 },
  newspaper: false,
  workflow: ZBA_BOARD_WORKFLOW,
})

export const ZBA_STARTERS = [
  VARIANCE_STARTER,
  SPECIAL_EXCEPTION_STARTER,
  EQUITABLE_WAIVER_STARTER,
  ADMINISTRATIVE_APPEAL_STARTER,
  REHEARING_MOTION_STARTER,
]
