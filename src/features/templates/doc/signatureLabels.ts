import type { SignerRole } from '@/features/town/profileSchema'
import { signerRoleLabels } from '@/features/town/signerRoleLabels'

const FIXED: ReadonlyMap<SignerRole, string> = new Map([
  ['building_official', 'Authorized signature'],
  ['code_enforcement_officer', 'Enforcement officer signature'],
])

export function signatureLabel(role: SignerRole): string {
  return FIXED.get(role) ?? `${signerRoleLabels()[role]} signature`
}
