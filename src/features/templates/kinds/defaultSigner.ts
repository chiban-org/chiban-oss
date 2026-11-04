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
])

export function defaultSignerRole(kind: TemplateKind): SignerRole {
  return SIGNERS.get(kind) ?? 'land_use_administrator'
}
