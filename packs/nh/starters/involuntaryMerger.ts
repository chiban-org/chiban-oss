import { doc } from '@packs/nh/starters/documentQuestions'
import { localPermitStarter } from '@packs/nh/starters/localPermit'
import type { StarterBundle } from '@packs/nh/starters/types'

const BASE = localPermitStarter({
  id: 'nh.starter.involuntary_merger_restoration',
  prefix: 'IML',
  slug: 'iml',
  label: 'Restoration of involuntarily merged lots',
  classification: 'nh.local_permit_other',
  payTiming: 'at_intake',
  allowsDirectIssue: false,
  feeCents: 5000,
  conditionText: 'Town records updated to show the premerger lots',
  closesOn: 'staff_closes',
  validityPhrase:
    'Decided {{application.issuedOn}}. The decision may be appealed in accordance with RSA 676.',
  documents: [
    doc('supporting_records', 'Supporting records', {
      help: 'Anything that shows how, why and when the town merged the lots. Describe each item in the application.',
      optional: true,
    }),
    doc('proof_of_ownership', 'Proof of legal title', {
      help: 'A recorded deed showing you hold title to every lot.',
      optional: true,
    }),
  ],
  fields: [
    {
      key: 'lots_involved',
      label: 'Lots involved (map and lot number of each)',
      type: 'textarea',
      required: true,
    },
    {
      key: 'merger_statement',
      label: 'How, why and when the town merged the lots',
      type: 'textarea',
      required: true,
    },
    {
      key: 'merger_purpose',
      label: 'The merger was made for',
      type: 'select',
      required: true,
      options: [
        { value: 'zoning', label: 'Zoning purposes' },
        { value: 'assessing', label: 'Assessing purposes' },
        { value: 'taxation', label: 'Taxation purposes' },
      ],
    },
    {
      key: 'supporting_information',
      label: 'Describe any supporting information you attach',
      type: 'textarea',
      required: false,
    },
    {
      key: 'holds_legal_title',
      label: 'I hold legal title to every lot listed',
      type: 'checkbox',
      required: true,
    },
    {
      key: 'merged_before_cutoff',
      label: 'The town merged these lots without my consent before September 18, 2010',
      type: 'checkbox',
      required: true,
    },
  ],
})

export const INVOLUNTARY_MERGER_STARTER: StarterBundle = {
  ...BASE,
  applicationType: {
    ...BASE.applicationType,
    workflow: {
      ...BASE.applicationType.workflow,
      substeps: [
        { state: 'submitted', key: 'filed', label: 'Filed' },
        { state: 'under_review', key: 'records_research', label: 'Town records research' },
        { state: 'under_review', key: 'governing_body_review', label: 'Governing body review' },
        { state: 'decided', key: 'records_updated', label: 'Town records updated' },
      ],
    },
  },
}
