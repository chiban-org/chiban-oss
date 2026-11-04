import {
  conditions,
  doc,
  fields,
  heading,
  notice,
  para,
  section,
  signature,
} from '@/features/templates/doc/build'
import { APPLICATION_FIELDS, type DocumentKindDef } from '@/features/templates/kinds/kindTypes'

const PERMIT_SUFFIX = [
  fields([
    ['Number', 'application.number'],
    ['Type', 'application.typeLabel'],
    ['Parcel', 'parcel.displayId'],
    ['Site address', 'parcel.siteAddress'],
    ['Owner', 'parcel.ownerName'],
    ['Contractor', 'permit.contractorWithLicense'],
    ['Issued', 'application.issuedOn'],
    ['Expires', 'application.expiresOn'],
    ['Code edition', 'codeEdition.label'],
    ['Fees', 'fees.status'],
  ]),
  heading('Conditions'),
  conditions(),
  signature('building_official'),
]

export const PLACARD_NOTICE =
  'Post this placard where it can be seen from the street until the final inspection.'

export const PERMIT_KIND: DocumentKindDef = {
  label: 'Permit',
  title: 'Permit',
  record: 'Issued permit',
  scale: 'document',
  fields: [...APPLICATION_FIELDS, 'permit.contractorWithLicense', 'fees.status'],
  sections: [],
  locked: [],
  defaultDoc: doc(...PERMIT_SUFFIX),
  textSuffix: PERMIT_SUFFIX,
}

export const PLACARD_KIND: DocumentKindDef = {
  label: 'Placard',
  title: 'Placard',
  record: 'Issued permit',
  scale: 'placard',
  fields: [...APPLICATION_FIELDS, 'permit.contractorWithLicense', 'fees.status'],
  sections: [],
  locked: [],
  defaultDoc: doc(
    fields([
      ['Number', 'application.number'],
      ['Site address', 'parcel.siteAddress'],
      ['Contractor', 'party.contractor.name'],
      ['Issued', 'application.issuedOn'],
      ['Expires', 'application.expiresOn'],
    ]),
    notice(PLACARD_NOTICE),
  ),
}

export const LETTER_KIND: DocumentKindDef = {
  label: 'Letter',
  title: 'Letter',
  record: 'Application',
  scale: 'document',
  fields: APPLICATION_FIELDS,
  sections: [],
  locked: [],
  defaultDoc: doc(
    para('Dear {{party.applicant.name}}:'),
    para(
      'This letter concerns {{application.typeLabel}} {{application.number}} for {{parcel.siteAddress}}.',
    ),
    signature('land_use_administrator'),
  ),
}

export const CERTIFICATE_KIND: DocumentKindDef = {
  label: 'Certificate of occupancy',
  title: 'Certificate of Occupancy',
  record: 'Certificate of occupancy',
  scale: 'document',
  fields: [
    ...APPLICATION_FIELDS,
    'certificate.number',
    'certificate.issuedOn',
    'certificate.finalInspection',
    'certificate.use',
  ],
  sections: [],
  locked: [],
  defaultDoc: doc(
    para(
      '{{town.name}} certifies that the work under permit {{application.number}} was inspected and the building may be occupied.',
    ),
    fields([
      ['Certificate number', 'certificate.number'],
      ['Permit number', 'application.number'],
      ['Parcel', 'parcel.displayId'],
      ['Site address', 'parcel.siteAddress'],
      ['Owner', 'parcel.ownerName'],
      ['Use', 'certificate.use'],
      ['Issued', 'certificate.issuedOn'],
      ['Final inspection', 'certificate.finalInspection'],
      ['Code edition', 'codeEdition.label'],
    ]),
    heading('Conditions'),
    conditions(),
    signature('building_official'),
  ),
}

export const TRC_SUMMARY_KIND: DocumentKindDef = {
  label: 'Technical review summary',
  title: 'Technical Review Committee summary',
  record: 'Application with technical review',
  scale: 'document',
  fields: APPLICATION_FIELDS,
  sections: [
    { name: 'trc.departments', label: 'Departments, reviewers and status' },
    { name: 'trc.comments', label: 'Comments by department' },
  ],
  locked: [],
  defaultDoc: doc(section('trc.departments'), section('trc.comments')),
}
