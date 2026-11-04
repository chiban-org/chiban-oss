import type { DocumentFrame } from '@/features/pdf/frame'
import type { MergeContext } from '@/features/templates/renderTemplate'
import { SIGNER_ROLES } from '@/features/town/profileSchema'

export function frameMergeContext(frame: DocumentFrame): MergeContext {
  const context: MergeContext = {
    'town.name': frame.townName,
    'town.address': frame.contact.address,
    'town.phone': frame.contact.phone,
    'town.email': frame.contact.email,
    'town.website': frame.contact.website,
    'office.name': frame.officeName,
  }
  for (const role of SIGNER_ROLES) {
    const signer = frame.signers.find((s) => s.role === role)
    context[`signer.${role}.name`] = signer?.name ?? ''
    context[`signer.${role}.title`] = signer?.title ?? ''
  }
  return context
}
