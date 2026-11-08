import { doc, when, yesBox } from '@packs/nh/starters/documentQuestions'
import { localPermitStarter } from '@packs/nh/starters/localPermit'

export const VOLUNTARY_MERGER_STARTER = localPermitStarter({
  id: 'nh.starter.voluntary_merger',
  prefix: 'VMG',
  slug: 'vmg',
  label: 'Voluntary merger of lots',
  classification: 'nh.local_permit_other',
  payTiming: 'at_intake',
  allowsDirectIssue: false,
  feeCents: 5000,
  conditionText: 'Mortgage holder consents received, or no mortgage on any lot',
  closesOn: 'staff_closes',
  validityPhrase:
    'Approved {{application.issuedOn}}. The notice of merger is to be recorded at the registry of deeds and a copy mailed to the assessing officials.',
  documents: [
    doc('deeds', 'Deeds for each lot', {
      help: 'The recorded deeds that show how the owners hold title to each lot.',
    }),
    doc('merger_notice', 'Signed notice of merger', {
      help: 'Signed by every owner, with the signatures acknowledged before a notary or justice of the peace.',
    }),
    doc('mortgage_holder_notice', 'Written notice to each mortgage holder', {
      help: 'Give this notice when you submit the application.',
      requiredIf: when('has_mortgage'),
    }),
    doc('mortgage_holder_consents', 'Written consent of each mortgage holder', {
      stage: 'before_decision',
      help: 'Recorded with the notice of merger.',
      requiredIf: when('has_mortgage'),
    }),
  ],
  fields: [
    {
      key: 'lots_to_merge',
      label: 'Lots to merge (map and lot number of each)',
      type: 'textarea',
      required: true,
    },
    {
      key: 'deed_references',
      label: 'Deed dates and registry book and page for each lot',
      type: 'textarea',
      required: true,
    },
    yesBox('contiguous_same_ownership', 'The lots are contiguous and held in the same ownership'),
    yesBox(
      'no_pending_applications',
      'No application on any of the lots is pending before the town',
    ),
    yesBox('no_ordinance_violation', 'The merger will not violate any ordinance or regulation'),
    yesBox(
      'consent_to_merge_and_record',
      'Every owner consents to the merger and to recording the notice',
    ),
    yesBox('has_mortgage', 'A mortgage or lien applies to one or more of the lots'),
    {
      key: 'lienholders',
      label: 'Mortgage holders and lienholders, with mailing address and the lot each holds',
      type: 'textarea',
      required: false,
      requireIf: { field: 'has_mortgage', op: 'is_true' },
      showIf: { field: 'has_mortgage', op: 'is_true' },
    },
    {
      key: 'additional_information',
      label: 'Additional information',
      type: 'textarea',
      required: false,
    },
  ],
})
