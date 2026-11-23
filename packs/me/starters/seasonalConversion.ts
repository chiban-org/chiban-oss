import {
  doc,
  PUBLIC_SEWER,
  permitStarter,
  startAndFinalChecklists,
} from '@packs/me/starters/permitParts'

export const SEASONAL_CONVERSION_STARTER = permitStarter({
  id: 'me.starter.seasonal_conversion',
  prefix: 'SC',
  slug: 'sc',
  label: 'Seasonal dwelling conversion permit',
  classification: 'me.seasonal_conversion',
  payTiming: 'at_approval',
  allowsDirectIssue: false,
  fields: [
    {
      key: 'bedrooms',
      label: 'Number of bedrooms',
      type: 'integer',
      required: false,
    },
    PUBLIC_SEWER,
  ],
  feeLines: [
    {
      code: 'seasonal_conversion',
      label: 'Seasonal conversion permit (10-144 CMR ch 241 Table 4A minimum)',
      due: 'at_approval',
      expr: { op: 'flat', cents: 5000 },
    },
  ],
  conditions: [
    {
      code: 'APPROVED',
      text: 'Conversion approved by the local plumbing inspector',
      blocksIssuance: true,
    },
  ],
  checklists: startAndFinalChecklists('sc'),
  documents: [
    doc('wastewater_system_information', 'Information on the existing wastewater disposal system', {
      help: 'The local plumbing inspector will say what is needed for this lot.',
      requiredIf: { field: 'public_sewer', op: 'equals', value: 'no' },
    }),
  ],
  closesOn: 'final_inspection_passed',
  permitDetails: 'Issued {{application.issuedOn}}, work to begin by {{application.expiresOn}}.',
})
