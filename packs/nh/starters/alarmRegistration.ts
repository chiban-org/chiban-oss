import { localPermitStarter, REGISTRATION_BINDINGS } from '@packs/nh/starters/localPermit'

export const ALARM_REGISTRATION_STARTER = localPermitStarter({
  id: 'nh.starter.alarm_registration',
  prefix: 'AR',
  slug: 'ar',
  label: 'Alarm system registration',
  classification: 'nh.local_permit_other',
  payTiming: 'at_intake',
  allowsDirectIssue: true,
  feeCents: 1500,
  conditionText: 'Emergency contact on file',
  closesOn: 'expiration',
  extraBindings: REGISTRATION_BINDINGS,
  validityPhrase: 'Issued {{application.issuedOn}}, expires {{application.expiresOn}}.',
  fields: [
    { key: 'alarm_company', label: 'Alarm company', type: 'text', required: false },
    {
      key: 'emergency_contact',
      label: 'Emergency contact name and phone',
      type: 'text',
      required: true,
    },
  ],
})
