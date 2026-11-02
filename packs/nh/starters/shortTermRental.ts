import { localPermitStarter, REGISTRATION_BINDINGS } from '@packs/nh/starters/localPermit'

export const SHORT_TERM_RENTAL_STARTER = localPermitStarter({
  id: 'nh.starter.short_term_rental',
  prefix: 'STR',
  slug: 'str',
  label: 'Short-term rental registration',
  classification: 'nh.local_permit_other',
  payTiming: 'at_intake',
  allowsDirectIssue: true,
  feeCents: 10000,
  conditionText: 'Smoke and carbon monoxide alarms confirmed',
  closesOn: 'expiration',
  extraBindings: REGISTRATION_BINDINGS,
  validityPhrase: 'Issued {{application.issuedOn}}, expires {{application.expiresOn}}.',
  fields: [
    {
      key: 'bedrooms',
      label: 'Bedrooms offered',
      type: 'integer',
      required: true,
      validation: { min: 1 },
    },
    {
      key: 'emergency_contact',
      label: 'Local emergency contact name and phone',
      type: 'text',
      required: true,
    },
  ],
})
