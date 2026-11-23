import { activePack } from '@/features/packs/registry'
import type { StateCodeSection } from '@/features/packs/schema'

export function stateCodeReference(entry: StateCodeSection): string {
  return `${entry.code} ${entry.edition} Section ${entry.section}`
}

export function stateCodeSectionsFor(
  editionKeys: readonly string[],
  sections: readonly StateCodeSection[] = activePack().stateCodeSections,
): StateCodeSection[] {
  return editionKeys.flatMap((key) => sections.filter((s) => s.editionKey === key))
}
