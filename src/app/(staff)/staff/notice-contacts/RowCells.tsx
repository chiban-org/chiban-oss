import type { ReactNode } from 'react'
import { SortBar } from '@/components/dataTable/SortHeader'
import { STACKED_CELL as QUEUE_STACKED_CELL } from '@/components/queue/QueueCells'
import { StatusChip } from '@/components/StatusChip'
import type { ParkTenant } from '@/db/schema'
import type { SortLink } from '@/features/dataTable/sort'
import type { ContactSortKey } from '@/features/rosters/contactListParams'
import type { EndState, EntryMeta } from '@/features/rosters/contactRows'
import { entryAnchor } from '@/features/rosters/links'

export type ContactSortLinks = Record<ContactSortKey, SortLink>

export const PANEL_CLASS = 'table-panel md:max-h-[calc(100dvh-6rem)] md:overflow-y-auto'

export const TABLE_CLASS =
  'w-full text-left text-sm max-md:block md:min-w-[54rem] [&_td]:[overflow-wrap:break-word] [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10'

const ROW_CLASS =
  'scroll-mt-16 target:bg-highlight target:shadow-[inset_4px_0_0_var(--action)] max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-2 max-md:px-4 max-md:py-3'

export const TITLE_CELL = 'max-md:order-[-3] max-md:block max-md:p-0'

export const CHIP_CELL =
  'whitespace-nowrap max-md:order-[-2] max-md:block max-md:justify-self-end max-md:p-0'

export const ACTIONS_CELL = 'max-md:col-span-2 max-md:block max-md:p-0'

export const STACKED_CELL = `${QUEUE_STACKED_CELL} max-md:p-0`

export function EntryRow({ row, children }: { row: EntryMeta; children: ReactNode }) {
  return (
    <tr id={entryAnchor(row.entryId)} className={`align-top ${ROW_CLASS}`}>
      {children}
    </tr>
  )
}

export function ContactSortBar({ name, links }: { name: string; links: ContactSortLinks }) {
  return (
    <SortBar
      className="mb-3 md:hidden"
      options={[
        { label: name, link: links.name },
        { label: 'Parcel', link: links.parcel },
        { label: 'Checked', link: links.checked },
      ]}
    />
  )
}

function chipStatus(row: EndState): 'passed' | 'overdue' | 'neutral' {
  if (!row.active) return 'neutral'
  return row.endedOn === null ? 'passed' : 'overdue'
}

export function StatusCell({ row }: { row: EndState }) {
  return (
    <td data-label="Status" className={CHIP_CELL}>
      <StatusChip status={chipStatus(row)} label={row.statusText} />
    </td>
  )
}

export function TenantList({ tenants }: { tenants: readonly ParkTenant[] }) {
  if (tenants.length === 0) return <span className="text-muted-foreground">No tenants</span>
  const count = tenants.length
  return (
    <details>
      <summary className="whitespace-nowrap">{`${count} ${count === 1 ? 'tenant' : 'tenants'}`}</summary>
      <ul className="m-0 list-none space-y-2 p-0">
        {tenants.map((t) => (
          <li key={t.tenantId}>
            <span className="font-medium">{t.name}</span>
            {t.siteLabel === '' ? null : (
              <span className="whitespace-nowrap">{`, ${t.siteLabel}`}</span>
            )}
            <br />
            <span className="text-muted-foreground">{t.mailingAddress}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
