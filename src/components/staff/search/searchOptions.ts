import type { ExactKind, SearchResult, SearchRow } from '@/features/search/searchTypes'

export interface SearchOption extends SearchRow {
  section: string
  seeAll: boolean
}

export interface SearchOptions {
  options: SearchOption[]
  exactIndex: number
}

export const EXACT_SECTION = 'Exact number'

const EXACT_DETAIL: Readonly<Record<ExactKind, string>> = {
  application: 'Application or permit',
  case: 'Enforcement case',
  order: 'Cease and desist order, opens its case',
  complaint: 'Complaint, opens its case',
  request: 'Right-to-Know request',
  receipt: 'Receipt, opens in a new tab',
  parcel: 'Parcel at this address',
}

function groupOptions(result: SearchResult): SearchOption[] {
  return result.groups.flatMap((group) => [
    ...group.rows.map((row) => ({
      ...row,
      key: `${group.key}:${row.key}`,
      section: group.label,
      seeAll: false,
    })),
    ...(group.seeAll === null
      ? []
      : [
          {
            key: `${group.key}:all`,
            section: group.label,
            href: group.seeAll.href,
            newTab: false,
            title: group.seeAll.label,
            detail: '',
            chip: null,
            seeAll: true,
          },
        ]),
  ])
}

export function searchOptions(result: SearchResult): SearchOptions {
  const options = groupOptions(result)
  const { exact } = result
  if (exact === null) return { options, exactIndex: -1 }
  const listed = options.findIndex((o) => o.href === exact.href && !o.seeAll)
  if (listed >= 0) return { options, exactIndex: listed }
  const exactOption: SearchOption = {
    key: `exact:${exact.href}`,
    section: EXACT_SECTION,
    href: exact.href,
    newTab: exact.newTab,
    title: exact.number,
    detail: EXACT_DETAIL[exact.kind],
    chip: null,
    seeAll: false,
  }
  return { options: [exactOption, ...options], exactIndex: 0 }
}

export interface OptionSection {
  label: string
  items: { option: SearchOption; index: number }[]
}

export function sectionsOf(options: readonly SearchOption[]): OptionSection[] {
  const sections: OptionSection[] = []
  for (const [index, option] of options.entries()) {
    const last = sections.at(-1)
    if (last?.label === option.section) last.items.push({ option, index })
    else sections.push({ label: option.section, items: [{ option, index }] })
  }
  return sections
}
