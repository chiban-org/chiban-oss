import { packRoles } from '@/features/packs/roles'

export const NO_ORDER_TEXT =
  'This state has no statutory order for these findings. Send a notice of violation instead.'

export function orderRuleKeyForKind(kind: string | undefined): string | null {
  const { rules } = packRoles()
  return kind === 'building_code' ? rules.buildingCodeOrder : rules.zoningOrder
}

export function orderAvailableFor(kinds: readonly (string | undefined)[]): boolean {
  return kinds.some((kind) => orderRuleKeyForKind(kind) !== null)
}

export function orderAvailableForFindings(
  findings: readonly { status: string; provisionKind?: string }[],
): boolean {
  const open = findings.filter((f) => f.status === 'open')
  const kinds = (open.length > 0 ? open : findings).map((f) => f.provisionKind)
  return orderAvailableFor(kinds.length > 0 ? kinds : [undefined])
}
