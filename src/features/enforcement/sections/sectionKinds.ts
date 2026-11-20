import { TOWN_SECTION_KINDS, type TownSectionKind } from '@/db/schema/townSections'

export function sectionKindsOffered(codeEnforced: boolean): readonly TownSectionKind[] {
  return codeEnforced ? TOWN_SECTION_KINDS : TOWN_SECTION_KINDS.filter((k) => k !== 'building_code')
}
