import {
  doc,
  IS_OWNER,
  NOT_OWNER,
  permitStarter,
  setYourFeeLine,
} from '@packs/me/starters/permitParts'

export const SIGN_STARTER = permitStarter({
  id: 'me.starter.sign',
  prefix: 'SG',
  slug: 'sg',
  label: 'Sign permit',
  classification: 'me.sign_permit',
  payTiming: 'at_approval',
  allowsDirectIssue: false,
  fields: [
    {
      key: 'sign_area_sq_ft',
      label: 'Sign area (sq ft)',
      type: 'decimal',
      required: true,
    },
    {
      key: 'illuminated',
      label: 'Illuminated',
      type: 'checkbox',
      required: false,
    },
    IS_OWNER,
  ],
  feeLines: [setYourFeeLine('sign', 'Sign permit fee', 'at_approval')],
  conditions: [
    {
      code: 'CONFIRMED',
      text: 'Sign size and setback meet the town ordinance',
      blocksIssuance: true,
    },
  ],
  documents: [
    doc('sign_drawing', 'Scaled drawing of the sign'),
    doc('sign_site_sketch', 'Site sketch with setbacks'),
    doc('landowner_permission', 'Landowner permission', {
      requiredIf: NOT_OWNER,
    }),
  ],
  closesOn: 'expiration',
  permitDetails: 'Issued {{application.issuedOn}}, expires {{application.expiresOn}}.',
})
