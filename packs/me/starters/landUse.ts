import {
  IS_OWNER,
  OWNER_AUTHORIZATION,
  PLOT_PLAN,
  permitStarter,
  setYourFeeLine,
} from '@packs/me/starters/permitParts'

export const LAND_USE_STARTER = permitStarter({
  id: 'me.starter.land_use',
  prefix: 'LU',
  slug: 'lu',
  label: 'Land use permit',
  classification: 'me.land_use_permit',
  payTiming: 'at_approval',
  allowsDirectIssue: false,
  fields: [
    {
      key: 'proposed_use',
      label: 'Proposed use',
      type: 'text',
      required: true,
    },
    {
      key: 'ordinance_section',
      label: 'Ordinance section',
      type: 'text',
      required: false,
    },
    IS_OWNER,
  ],
  feeLines: [setYourFeeLine('land_use', 'Land use permit fee', 'at_approval')],
  conditions: [
    {
      code: 'CONFIRMED',
      text: 'Use and dimensions meet the land use ordinance',
      blocksIssuance: true,
    },
  ],
  documents: [PLOT_PLAN, OWNER_AUTHORIZATION],
  closesOn: 'expiration',
  permitDetails: 'Issued {{application.issuedOn}}, expires {{application.expiresOn}}.',
})
