import { inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, configVersions, parcels } from '@/db/schema'
import {
  type ApplicationTypeBody,
  boardKindOf,
} from '@/features/applications/applicationTypeSchema'
import { listApplicationsForViewer } from '@/features/applications/listForViewer'
import { CORE_STATES, type CoreState } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import type { ConfigPins } from '@/features/config/bindings'
import { reinspectableFailureIds } from '@/features/inspections/lookup'
import { feeBalance } from '@/features/ledger/feeBalance'
import { getActiveProcessor } from '@/features/payments/processorAccounts'
import { loadTownProfile } from '@/features/pdf/documentFrame'
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

async function boardApplications(db: DbOrTx, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const apps = await db
    .select({ id: applications.id, pins: applications.configPins })
    .from(applications)
    .where(inArray(applications.id, ids))
  const typeOf = new Map(apps.map((a) => [a.id, (a.pins as ConfigPins).applicationType]))
  const types = await db
    .select({ id: configVersions.id, body: configVersions.body })
    .from(configVersions)
    .where(inArray(configVersions.id, [...new Set(typeOf.values())]))
  const board = new Set(
    types
      .filter((t) => boardKindOf((t.body as ApplicationTypeBody).classification) !== null)
      .map((t) => t.id),
  )
  return new Set(ids.filter((id) => board.has(typeOf.get(id) ?? '')))
}

async function officeForPayment(db: DbOrTx, signal: AbortSignal): Promise<string | null> {
  if ((await getActiveProcessor(db, signal)).state === 'known') return null
  return (await loadTownProfile(db, signal))?.officeName ?? 'land use office'
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
  const [addressOf, missing, board, payAtOffice] = await Promise.all([
    addressesOf(db, [...new Set(rows.map((r) => r.parcelId))]),
    missingDocumentsByApplication(db, ids, signal),
    boardApplications(db, ids),
    officeForPayment(db, signal),
  ])
  return await Promise.all(
    rows.map(async (row) => {
      const state = row.state as CoreState
      const facts = {
        state,
        ...(await moneyAndInspections(db, row.id, state, signal)),
        missingDocuments: missing.get(row.id) ?? [],
        board: board.has(row.id),
        payAtOffice,
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
