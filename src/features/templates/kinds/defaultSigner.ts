import type { TemplateKind } from '@/features/templates/templateSchema'
import type { SignerRole } from '@/features/town/profileSchema'

const SIGNERS: ReadonlyMap<TemplateKind, SignerRole> = new Map<TemplateKind, SignerRole>([
  ['permit', 'building_official'],
  ['placard', 'building_official'],
  ['certificate', 'building_official'],
  ['enforcement_order', 'code_enforcement_officer'],
  ['counsel_packet_cover', 'code_enforcement_officer'],
  ['rtk_response', 'town_clerk'],
  ['receipt', 'town_clerk'],
  ['permit_decision_letter', 'building_official'],
  ['incomplete_notice', 'building_official'],
])

const PLUMBING_SIGNED: ReadonlySet<TemplateKind> = new Set<TemplateKind>([
  'permit',
  'placard',
  'permit_decision_letter',
])

export interface SignerScope {
  plumbingOwned: boolean
}

export function defaultSignerRole(
  kind: TemplateKind,
  scope: SignerScope = { plumbingOwned: false },
): SignerRole {
  if (scope.plumbingOwned && PLUMBING_SIGNED.has(kind)) return 'plumbing_inspector'
  return SIGNERS.get(kind) ?? 'land_use_administrator'
}

export function signerRoleOverride(kind: TemplateKind, scope: SignerScope): SignerRole | undefined {
  const role = defaultSignerRole(kind, scope)
  return role === defaultSignerRole(kind) ? undefined : role
}
