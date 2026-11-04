import { FilterTabs } from '@/components/dataTable/FilterTabs'

const TABS = [
  { href: '/staff/overrides/aliases', label: 'Parcel IDs' },
  { href: '/staff/overrides/clocks', label: 'Clocks' },
  { href: '/staff/overrides/fees', label: 'Fees' },
] as const

export function OverridesTabs({ current }: { current: (typeof TABS)[number]['href'] }) {
  return (
    <FilterTabs
      label="Overrides"
      tabs={TABS.map((tab) => ({ ...tab, active: tab.href === current }))}
    />
  )
}
