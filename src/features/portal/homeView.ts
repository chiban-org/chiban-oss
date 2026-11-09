import { inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, parcels } from '@/db/schema'
import { listApplicationsForViewer } from '@/features/applications/listForViewer'
import { CORE_STATES, type CoreState } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { reinspectableFailureIds } from '@/features/inspections/lookup'
import { feeBalance } from '@/features/ledger/feeBalance'
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

async function factsFor(db: DbOrTx, id: string, state: CoreState, signal: AbortSignal) {
  const dueCents = state === 'draft' ? 0 : (await feeBalance(db, id, signal)).dueCents
  const failedInspection = state === 'issued' && (await reinspectableFailureIds(db, id)).size > 0
  return { state, dueCents, failedInspection }
}

export async function loadPortalHome(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
): Promise<HomeRow[]> {
  const page = await listApplicationsForViewer(
    db,
    actor,
    { limit: PAGE_SIZE, scope: 'party' },
    signal,
  )
  const ids = page.rows.map((r) => r.id)
  const parcelIds = [...new Set(page.rows.map((r) => r.parcelId))]
  const [received, addresses] = await Promise.all([
    ids.length === 0
      ? []
      : db
          .select({ id: applications.id, receivedDate: applications.receivedDate })
          .from(applications)
          .where(inArray(applications.id, ids)),
    parcelIds.length === 0
      ? []
      : db
          .select({ id: parcels.id, siteAddress: parcels.siteAddress })
          .from(parcels)
          .where(inArray(parcels.id, parcelIds)),
  ])
  const filed = new Map(received.map((r) => [r.id, r.receivedDate !== null]))
  const addressOf = new Map(addresses.map((a) => [a.id, a.siteAddress]))
  const kept = page.rows.filter(
    (r) => isCoreState(r.state) && !(r.state === 'withdrawn' && filed.get(r.id) !== true),
  )
  return await Promise.all(
    kept.map(async (row) => {
      const facts = await factsFor(db, row.id, row.state as CoreState, signal)
      return {
        id: row.id,
        number: row.number,
        projectTitle: row.projectTitle,
        address: addressOf.get(row.parcelId) ?? null,
        state: facts.state,
        group: homeGroup(facts),
        nextStep: homeNextStep(facts),
      }
    }),
  )
}
