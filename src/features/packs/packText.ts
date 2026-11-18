import { lockedTexts } from '@/features/templates/doc/lockedTexts'
import { signerRoleLabels } from '@/features/town/signerRoleLabels'

export interface PackText {
  signerRoleLabels: Readonly<Record<string, string>>
  lockedTexts: Readonly<Record<string, string>>
}

export function packText(): PackText {
  return { signerRoleLabels: signerRoleLabels(), lockedTexts: lockedTexts() }
}
