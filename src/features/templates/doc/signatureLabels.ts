import { SIGNER_ROLE_LABELS, type SignerRole } from '@/features/town/profileSchema'

const FIXED: ReadonlyMap<SignerRole, string> = new Map([
  ['building_official', 'Authorized signature'],
  ['code_enforcement_officer', 'Enforcement officer signature'],
])

const ROLE_LABELS: ReadonlyMap<string, string> = new Map(Object.entries(SIGNER_ROLE_LABELS))

export function signatureLabel(role: SignerRole): string {
  return FIXED.get(role) ?? `${ROLE_LABELS.get(role) ?? role} signature`
}
