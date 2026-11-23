import {
  AFTER_THE_FACT,
  doc,
  IS_OWNER,
  OWNER_AUTHORIZATION,
  permitStarter,
  setYourFeeLine,
  startAndFinalChecklists,
} from '@packs/me/starters/permitParts'

export const SHORELAND_STARTER = permitStarter({
  id: 'me.starter.shoreland',
  prefix: 'SLZ',
  slug: 'slz',
  label: 'Shoreland permit',
  classification: 'me.shoreland_permit',
  payTiming: 'at_approval',
  allowsDirectIssue: false,
  fields: [
    {
      key: 'shoreland_district',
      label: 'Shoreland zoning district',
      type: 'select',
      required: true,
      options: [
        { value: 'resource_protection', label: 'Resource Protection' },
        { value: 'stream_protection', label: 'Stream Protection' },
        { value: 'limited_residential', label: 'Limited Residential' },
        { value: 'limited_commercial', label: 'Limited Commercial' },
        { value: 'general_development_1', label: 'General Development I' },
        { value: 'general_development_2', label: 'General Development II' },
        {
          value: 'commercial_fisheries',
          label: 'Commercial Fisheries/Maritime Activities',
        },
      ],
    },
    {
      key: 'activity',
      label: 'Activity',
      type: 'select',
      required: true,
      options: [
        { value: 'new_structure', label: 'New structure' },
        { value: 'expansion', label: 'Expansion of an existing structure' },
        { value: 'clearing', label: 'Clearing or removal of vegetation' },
        {
          value: 'filling_grading',
          label: 'Filling, grading or other earth moving',
        },
        { value: 'pier_dock', label: 'Pier, dock or wharf' },
        { value: 'other', label: 'Other' },
      ],
    },
    {
      key: 'distance_to_high_water_ft',
      label: 'Distance from the normal high-water line (feet)',
      type: 'decimal',
      required: false,
      validation: { min: 0, max: 10000 },
    },
    IS_OWNER,
    AFTER_THE_FACT,
  ],
  feeLines: [setYourFeeLine('shoreland', 'Shoreland permit fee', 'at_approval')],
  conditions: [
    {
      code: 'DISTRICT',
      text: 'Activity confirmed as allowed in this district by the shoreland zoning ordinance',
      blocksIssuance: true,
    },
    {
      code: 'EROSION',
      text: 'Erosion and sedimentation controls in place before soil is disturbed',
      blocksIssuance: false,
    },
  ],
  checklists: startAndFinalChecklists('slz'),
  documents: [
    doc('shoreland_site_plan', 'Site plan', {
      help: 'Show the normal high-water line, setbacks, existing and proposed structures, and any clearing.',
    }),
    OWNER_AUTHORIZATION,
  ],
  closesOn: 'final_inspection_passed',
  permitDetails: 'Issued {{application.issuedOn}}, expires {{application.expiresOn}}.',
})
