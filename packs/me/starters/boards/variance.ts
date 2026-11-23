import {
  ABUTTER_NOTICE_LINE,
  BOARD_OF_APPEALS_WORKFLOW,
  boardStarter,
} from '@packs/me/starters/boards/shared'
import { doc } from '@packs/me/starters/permitParts'
import type { FormField } from '@/features/forms/formSchema'

const UNDUE_HARDSHIP = {
  field: 'variance_type',
  op: 'equals',
  value: 'undue_hardship',
} as const

function criterion(key: string, label: string): FormField {
  return {
    key,
    label,
    type: 'textarea',
    required: false,
    showIf: UNDUE_HARDSHIP,
    requireIf: UNDUE_HARDSHIP,
  }
}

export const RECORDING_CERTIFICATE_TEXT =
  '{{town.name}}\n\nCertificate of variance\n\nUnder 30-A MRSA §4353(5), the {{town.name}} Board of Appeals certifies that it has granted a variance for the property described below.\n\nCurrent property owner: {{parcel.ownerName}}\n\nProperty: parcel {{parcel.displayId}}, {{parcel.siteAddress}}, described in the deed recorded at Book ____, Page ____ of the last recorded deed in its chain of title.\n\nVariance: {{application.typeLabel}} {{application.number}}, {{project.title}}\n\nDate the variance was granted: ____\n\nConditions of the variance: {{conditions.list}}\n\nThis certificate must be recorded in the registry of deeds within 90 days of the date of the final written approval of the variance, or the variance is void. The variance is not valid until it is recorded (30-A MRSA §4353(5)).\n\n{{signer.zba_chair.name}}, {{signer.zba_chair.title}}'

export const VARIANCE_STARTER = boardStarter({
  id: 'me.starter.boa_variance',
  prefix: 'VAR',
  slug: 'var',
  label: 'Variance',
  classification: 'me.boa_variance',
  fields: [
    {
      key: 'ordinance_section',
      label: 'Ordinance section',
      type: 'text',
      required: true,
    },
    {
      key: 'relief_requested',
      label: 'Relief requested',
      type: 'textarea',
      required: true,
    },
    {
      key: 'variance_type',
      label: 'Kind of variance',
      type: 'select',
      required: true,
      options: [
        {
          value: 'undue_hardship',
          label: 'Undue hardship (30-A MRSA §4353(4))',
        },
        {
          value: 'disability',
          label: 'Disability access (30-A MRSA §4353(4-A))',
        },
        {
          value: 'dwelling_setback',
          label: 'Setback for a dwelling (30-A MRSA §4353(4-B))',
        },
        {
          value: 'dimensional',
          label: 'Dimensional standards (30-A MRSA §4353(4-C))',
        },
      ],
    },
    criterion(
      'criterion_reasonable_return',
      'The land in question cannot yield a reasonable return unless a variance is granted',
    ),
    criterion(
      'criterion_unique_circumstances',
      'The need for a variance is due to the unique circumstances of the property and not to the general conditions in the neighborhood',
    ),
    criterion(
      'criterion_essential_character',
      'The granting of a variance will not alter the essential character of the locality',
    ),
    criterion(
      'criterion_not_self_created',
      'The hardship is not the result of action taken by the applicant or a prior owner',
    ),
  ],
  noticeLine: ABUTTER_NOTICE_LINE,
  workflow: BOARD_OF_APPEALS_WORKFLOW,
  documents: [
    doc('variance_site_sketch', 'Site sketch with lot lines, buildings and setbacks'),
    doc('deed_reference', 'Copy of the last recorded deed', {
      help: 'The recording certificate names the book and page of this deed.',
    }),
  ],
  extraTemplates: [
    {
      key: 'var-recording-certificate',
      label: 'Variance recording certificate',
      kind: 'letter',
      body: RECORDING_CERTIFICATE_TEXT,
    },
  ],
})
