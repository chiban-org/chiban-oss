import type { OrderTexts } from '@/features/packs/schema'
import type { TextTemplateBody } from '@/features/templates/templateSchema'

export const ME_ORDER_TEXTS: OrderTexts = {
  motionNotice:
    'If the corrective action is not taken within the time this order provides, the town may take the matter to court.',
  lienWarning: 'If the violation is not corrected, the town may take further enforcement action.',
  ceaseSentence: 'You must stop the activity described in this order immediately.',
  noticeOfViolationIntro:
    'The town has found a possible violation at this property. This notice describes what was found.',
  noticeOfViolationRequest:
    'Please contact the code enforcement officer to discuss how the violation will be corrected.',
}

export const ME_ENFORCEMENT_TEMPLATES: TextTemplateBody[] = [
  {
    key: 'me-notice-of-violation',
    label: 'Notice of violation',
    kind: 'letter',
    body: '{{town.name}}\n\nNotice of violation\n\nTo {{parcel.ownerName}}, owner of parcel {{parcel.displayId}}, {{parcel.siteAddress}}.\n\nThe code enforcement officer has found a possible violation of the town ordinance at this property.\n\nWhat was found: ____\n\nOrdinance provision: ____\n\nPlease contact the code enforcement officer to discuss how the violation will be corrected. A land use violation may lead to civil penalties under 30-A MRSA §4452(3).\n\n{{signer.code_enforcement_officer.name}}, {{signer.code_enforcement_officer.title}}',
  },
  {
    key: 'me-shoreland-cure-notice',
    label: 'Shoreland cure notice',
    kind: 'letter',
    body: '{{town.name}}\n\nNotice of a shoreland zoning violation and time to correct it\n\nTo {{parcel.ownerName}}, owner of parcel {{parcel.displayId}}, {{parcel.siteAddress}}, and to any occupant of the property.\n\nThe code enforcement officer has found a violation of the shoreland zoning ordinance at this property.\n\nWhat was found: ____\n\nOrdinance provision: ____\n\nThis notice is sent by certified mail, return receipt requested, under 30-A MRSA §4452(1-A).\n\nIf the violation is not corrected within 10 days, the municipality may deny, suspend or revoke permits for further development of the land until the violation is corrected and the penalties and costs are paid, and may file a civil action.\n\n{{signer.code_enforcement_officer.name}}, {{signer.code_enforcement_officer.title}}',
  },
]
