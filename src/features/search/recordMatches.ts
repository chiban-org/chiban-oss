import { desc, eq, ilike, or } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { enforcementCases, parcels, rtkRequests } from '@/db/schema'
import { caseChipStatus } from '@/features/enforcement/chipStatus'
import { CASE_STATUS_LABELS } from '@/features/enforcement/labels'
import { type ParcelSearchHit, searchParcels } from '@/features/parcels/searchParcels'
import { RTK_STATUS_LABELS } from '@/features/rtk/labels'
import { requestRowChipStatus } from '@/features/rtk/requestStatus'
import type { CivilDate } from '@/types/civilDate'
import { sameAddress } from './addressMatch'
import {
  type ExactRecord,
  GROUP_LIMIT,
  joinDetail,
  likePattern,
  type SearchGroup,
} from './searchTypes'

export async function caseMatches(db: DbOrTx, query: string): Promise<SearchGroup> {
  const pattern = likePattern(query)
  const rows = await db
    .select({
      id: enforcementCases.id,
      number: enforcementCases.number,
      status: enforcementCases.status,
      locationText: enforcementCases.locationText,
    })
    .from(enforcementCases)
    .leftJoin(parcels, eq(parcels.id, enforcementCases.parcelId))
    .where(
      or(
        ilike(enforcementCases.number, pattern),
        ilike(enforcementCases.locationText, pattern),
        ilike(parcels.siteAddress, pattern),
        ilike(parcels.ownerName, pattern),
      ),
    )
    .orderBy(desc(enforcementCases.openedOn), desc(enforcementCases.number))
    .limit(GROUP_LIMIT)
  return {
    key: 'cases',
    label: 'Enforcement cases',
    seeAll: null,
    rows: rows.map((r) => ({
      key: r.id,
      href: `/staff/enforcement/${r.id}`,
      title: r.number,
      detail: r.locationText,
      chip: { status: caseChipStatus(r.status), label: CASE_STATUS_LABELS[r.status] },
      newTab: false,
    })),
  }
}

export async function requestMatches(
  db: DbOrTx,
  query: string,
  today: CivilDate,
): Promise<SearchGroup> {
  const pattern = likePattern(query)
  const rows = await db
    .select({
      id: rtkRequests.id,
      number: rtkRequests.number,
      status: rtkRequests.status,
      requesterName: rtkRequests.requesterName,
      description: rtkRequests.description,
      dueOn: rtkRequests.openDueOn,
    })
    .from(rtkRequests)
    .where(
      or(
        ilike(rtkRequests.number, pattern),
        ilike(rtkRequests.requesterName, pattern),
        ilike(rtkRequests.description, pattern),
      ),
    )
    .orderBy(desc(rtkRequests.receivedOn), desc(rtkRequests.number))
    .limit(GROUP_LIMIT)
  return {
    key: 'requests',
    label: 'Requests',
    seeAll: null,
    rows: rows.map((r) => ({
      key: r.id,
      href: `/staff/records/requests/${r.id}`,
      title: r.number,
      detail: joinDetail([r.requesterName, r.description]),
      chip: {
        status: requestRowChipStatus(r.status, r.dueOn !== null && r.dueOn < today),
        label: RTK_STATUS_LABELS[r.status],
      },
      newTab: false,
    })),
  }
}

export interface ParcelMatches {
  group: SearchGroup
  atAddress: boolean
  exact: ExactRecord | null
}

export async function parcelMatches(
  db: DbOrTx,
  query: string,
  signal: AbortSignal,
): Promise<ParcelMatches> {
  const found = await searchParcels(db, { q: query, limit: GROUP_LIMIT }, signal)
  const atAddress = found.filter((hit) => sameAddress(hit.siteAddress, query))
  const hits = [...atAddress, ...found.filter((hit) => !atAddress.includes(hit))]
  const active = atAddress.filter((hit) => hit.status === 'active')
  const only = active.length === 1 ? active[0] : undefined
  return {
    atAddress: atAddress.length > 0,
    exact:
      only === undefined
        ? null
        : {
            kind: 'parcel',
            number: only.displayId ?? only.siteAddress ?? query,
            href: `/staff/parcels/${only.parcelId}`,
            newTab: false,
          },
    group: parcelGroup(hits),
  }
}

function parcelGroup(hits: readonly ParcelSearchHit[]): SearchGroup {
  return {
    key: 'parcels',
    label: 'Parcels',
    seeAll: null,
    rows: hits.map((hit) => ({
      key: hit.parcelId,
      href: `/staff/parcels/${hit.parcelId}`,
      title: hit.displayId ?? 'No map-lot ID',
      detail: joinDetail([hit.siteAddress, hit.ownerName]),
      chip: hit.status === 'retired' ? { status: 'neutral', label: 'Retired' } : null,
      newTab: false,
    })),
  }
}
