import { SIGNER_ROLES, type SignerRole } from '@/features/town/profileSchema'

export function signerRoleChoices(offered: readonly SignerRole[], current: string): SignerRole[] {
  return SIGNER_ROLES.filter((role) => role === current || offered.includes(role))
}

export function signerFieldOffered(name: string, offered: readonly string[]): boolean {
  const [prefix, role] = name.split('.')
  return prefix !== 'signer' || role === undefined || offered.includes(role)
}
