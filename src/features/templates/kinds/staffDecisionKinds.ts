import { doc, fields, heading, locked, para, signature } from '@/features/templates/doc/build'
import { APPLICATION_FIELDS, type DocumentKindDef } from '@/features/templates/kinds/kindTypes'

export const PERMIT_DECISION_LETTER_KIND: DocumentKindDef = {
  label: 'Permit decision letter',
  title: 'Decision on your application',
  record: 'Staff decision',
  scale: 'document',
  fields: [
    ...APPLICATION_FIELDS,
    'decision.outcome',
    'decision.votedOn',
    'decision.reasons',
    'decision.reasonsSection',
  ],
  sections: [],
  locked: ['decision.appealRights'],
  defaultDoc: doc(
    fields([
      ['Application', 'application.number'],
      ['Permit type', 'application.typeLabel'],
      ['Parcel', 'parcel.displayId'],
      ['Address', 'parcel.siteAddress'],
      ['Decision', 'decision.outcome'],
      ['Decided on', 'decision.votedOn'],
    ]),
    para('{{decision.reasonsSection}}'),
    heading('How to appeal'),
    locked('decision.appealRights'),
    signature('building_official'),
  ),
}

export const INCOMPLETE_NOTICE_KIND: DocumentKindDef = {
  label: 'Incomplete application notice',
  title: 'Your application is incomplete',
  record: 'Incomplete application',
  scale: 'document',
  fields: [...APPLICATION_FIELDS, 'incomplete.reason', 'incomplete.sentOn'],
  sections: [],
  locked: [],
  defaultDoc: doc(
    fields([
      ['Application', 'application.number'],
      ['Parcel', 'parcel.displayId'],
      ['Date of this notice', 'incomplete.sentOn'],
    ]),
    heading('What is missing'),
    para('{{incomplete.reason}}'),
    para(
      'Send what is missing to the town office. The application is reviewed once it is complete.',
    ),
    signature('building_official'),
  ),
}
