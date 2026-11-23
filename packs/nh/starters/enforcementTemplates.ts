import type { OrderTexts } from '@/features/packs/schema'

export const NH_ORDER_TEXTS: OrderTexts = {
  motionNotice:
    'Unless the corrective action is taken within the time this order provides, or an answer is filed within 20 days of service, a motion for summary enforcement of this order will be made to the district court for the place where the property is located.',
  lienWarning:
    'If you do not take the corrective action or file an answer, the town may take the corrective action itself. Its costs become a lien on the property, enforceable like real estate taxes, and may lead to loss of the property if not paid.',
  ceaseSentence: 'You must cease the activity described in this order immediately.',
  noticeOfViolationIntro:
    'The town has found a possible violation at this property. This notice describes what was found. It is not a cease and desist order.',
  noticeOfViolationRequest:
    'Please contact the town to discuss how the violation will be corrected.',
}
