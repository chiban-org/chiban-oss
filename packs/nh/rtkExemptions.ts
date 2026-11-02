export interface RtkExemption {
  key: string
  paragraph: string
  label: string
  citation: { label: string; url: string }
}

const RSA_91A_5 = 'https://gc.nh.gov/rsa/html/VI/91-A/91-A-5.htm'

const PARAGRAPHS: ReadonlyArray<readonly [string, string]> = [
  ['I', 'Grand and petit jury records'],
  ['I-a', 'The master jury list'],
  ['II', 'Parole and pardon board records'],
  ['III', 'Personal school records of pupils'],
  [
    'IV',
    'Internal personnel practices, confidential, commercial, or financial information, test data, and files whose disclosure would invade privacy',
  ],
  ['V', 'Educator certification records'],
  ['VI', 'Records of preparation for emergency functions'],
  ['VII', 'Unique pupil identification information'],
  ['VIII', 'Notes or other materials made for personal use that have no official purpose'],
  ['IX', 'Preliminary drafts not circulated to a quorum or majority of a public body'],
  ['X', 'Body-worn camera recordings'],
  ['XI', 'Information technology security records'],
  ['XII', 'Attorney-client privileged communications and attorney work product'],
  ['XIII', 'Youth development center claims records'],
]

export const NH_RTK_EXEMPTIONS: RtkExemption[] = PARAGRAPHS.map(([paragraph, label]) => ({
  key: `nh.rtk.91a5.${paragraph.toLowerCase()}`,
  paragraph,
  label,
  citation: { label: `RSA 91-A:5 ${paragraph}`, url: RSA_91A_5 },
}))

export const OTHER_LAW_EXEMPTION_KEY = 'other_law'
