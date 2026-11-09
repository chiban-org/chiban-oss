import { inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { parcels } from '@/db/schema'
import { listApplicationsForViewer } from '@/features/applications/listForViewer'
import { CORE_STATES, type CoreState } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { reinspectableFailureIds } from '@/features/inspections/lookup'
import { feeBalance } from '@/features/ledger/feeBalance'
import { missingDocumentsByApplication } from '@/features/portal/homeDocuments'
import { type HomeGroup, homeGroup, homeNextStep } from '@/features/portal/homeGroups'

const PAGE_SIZE = 50

export interface HomeRow {
  id: string
  number: string
  projectTitle: string
  address: string | null
  state: CoreState
  group: HomeGroup
  nextStep: string
}

function isCoreState(state: string): state is CoreState {
  return (CORE_STATES as readonly string[]).includes(state)
}

async function moneyAndInspections(db: DbOrTx, id: string, state: CoreState, signal: AbortSignal) {
  const dueCents = state === 'draft' ? 0 : (await feeBalance(db, id, signal)).dueCents
  const failedInspection = state === 'issued' && (await reinspectableFailureIds(db, id)).size > 0
  return { dueCents, failedInspection }
}

async function addressesOf(db: DbOrTx, parcelIds: string[]): Promise<Map<string, string | null>> {
  if (parcelIds.length === 0) return new Map()
  const rows = await db
    .select({ id: parcels.id, siteAddress: parcels.siteAddress })
    .from(parcels)
    .where(inArray(parcels.id, parcelIds))
  return new Map(rows.map((r) => [r.id, r.siteAddress]))
}

export async function loadPortalHome(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
  options: { limit?: number } = {},
): Promise<HomeRow[]> {
  const page = await listApplicationsForViewer(
    db,
    actor,
    { limit: options.limit ?? PAGE_SIZE, scope: 'party', withoutDeletedDrafts: true },
    signal,
  )
  const rows = page.rows.filter((r) => isCoreState(r.state))
  const ids = rows.map((r) => r.id)
  const [addressOf, missing] = await Promise.all([
    addressesOf(db, [...new Set(rows.map((r) => r.parcelId))]),
    missingDocumentsByApplication(db, ids, signal),
  ])
  return await Promise.all(
    rows.map(async (row) => {
      const state = row.state as CoreState
      const facts = {
        state,
        ...(await moneyAndInspections(db, row.id, state, signal)),
        missingDocuments: missing.get(row.id) ?? [],
      }
      return {
        id: row.id,
        number: row.number,
        projectTitle: row.projectTitle,
        address: addressOf.get(row.parcelId) ?? null,
        state,
        group: homeGroup(facts),
        nextStep: homeNextStep(facts),
      }
    }),
  )
}
