import { ME_URLS } from '@packs/me/rules/urls'
import type { RtkExemption } from '@/features/packs/schema'

const PARAGRAPHS: ReadonlyArray<readonly [string, string]> = [
  ['A', 'Records designated confidential by statute'],
  ['B', 'Records privileged against discovery or use as evidence'],
  ['C', 'Legislative papers, working papers and drafts'],
  ['C-1', 'Personal information in a communication between a constituent and an elected official'],
  ['D', 'Material prepared for collective bargaining negotiations'],
  [
    'E',
    'Confidential faculty and administrative committee records of the state colleges and university',
  ],
  ['F', 'Confidential records held by a municipal association'],
  ['G', "An association's legislative positions and insurance materials"],
  ['H', 'Medical records of municipal ambulance, rescue and emergency medical units'],
  ['I', 'Fire department records on a juvenile fire setter'],
  ['J', 'Working papers of an advisory organization'],
  ['K', 'Identifying information about minors in municipal recreation or education programs'],
  ['L', 'Security plans and risk assessments prepared against terrorism'],
  ['M', 'Information technology security records'],
  ['N', 'Social Security numbers'],
  ['O', 'Personal contact information of public employees'],
  ['P', 'Geographic information on recreational trails over private land'],
  ['Q', 'Corrections and county jail security records'],
  ['S', 'Email addresses collected only to send notifications'],
  ['T', 'Department of Marine Resources processing and depuration research'],
  ['U', 'Railroad hazardous materials records'],
  ['V', 'Participant information in a community well-being check program'],
  ['W', 'Confidential information about an individual utility customer'],
  ['X', 'Information about an individual customer of a public sewer system'],
]

export const ME_FOAA_EXEMPTIONS: RtkExemption[] = PARAGRAPHS.map(([paragraph, label]) => ({
  key: `me.foaa.402_3.${paragraph.toLowerCase()}`,
  paragraph,
  label,
  citation: { label: `1 MRSA §402(3)(${paragraph})`, url: ME_URLS.title1sec402 },
}))
