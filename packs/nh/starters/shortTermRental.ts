import { doc, SEPTIC_SYSTEM, when } from '@packs/nh/starters/documentQuestions'
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
  version: 2,
  documents: [
    doc('rental_septic_approval', 'Septic approval that matches the bedrooms offered', {
      requiredIf: when('septic_system'),
    }),
  ],
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
    {
      key: 'meals_rooms_license',
      label: 'Meals and rooms license number',
      type: 'text',
      required: false,
    },
    SEPTIC_SYSTEM,
  ],
})
