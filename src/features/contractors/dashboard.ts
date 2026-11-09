import { and, desc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, parcels, projectParties, projects } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { CoreState } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { getVersion } from '@/features/config/store'
import { type ApplicationExtras, loadExtras } from '@/features/contractors/dashboardExtras'
import { type NeedItem, type NeedSource, needsFrom } from '@/features/contractors/dashboardNeeds'
import {
  CONTRACTOR_TABS,
  type ContractorTab,
  OPEN_STATES,
  TAB_STATES,
  type TabCounts,
  tabOfState,
} from '@/features/contractors/dashboardTabs'
import { getLayerStatus } from '@/features/gis/layerStatus'
import { type HonestValue, honestFromLayer, honestText } from '@/features/honest/honest'
import { displayIdsFor } from '@/features/parcels/displayId'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'

export interface ContractorApplicationRow extends ApplicationExtras {
  applicationId: string
  number: string
  typeLabel: string
  state: CoreState
  issuedOn: CivilDate | null
}

export interface ContractorProjectRow {
  projectId: string
  title: string
  parcelDisplayId: string | null
  siteAddress: HonestValue<string>
  applications: ContractorApplicationRow[]
}

export interface ContractorDashboard {
  rows: ContractorProjectRow[]
  needs: NeedItem[]
  counts: TabCounts
  total: number
  offset: number
  nextCursor: string | null
  prevCursor: string | null
}

interface ListInput {
  limit: number
  cursor?: string
  tab?: ContractorTab
  q?: string
}

function offsetOf(cursor: string | undefined): number {
  if (cursor === undefined || !/^\d+$/.test(cursor)) return 0
  const offset = Number(cursor)
  return Number.isSafeInteger(offset) ? offset : 0
}

function searchPattern(q: string | undefined): string | null {
  const text = q?.trim() ?? ''
  return text === '' ? null : `%${text.replace(/[\\%_]/g, '\\$&')}%`
}

function partyJoin(userId: string): SQL {
  return and(
    eq(projectParties.projectId, projects.id),
    eq(projectParties.userId, userId),
    eq(projectParties.role, 'contractor'),
    isNull(projectParties.removedAt),
  ) as SQL
}

function matchesSearch(pattern: string | null): SQL | undefined {
  return pattern === null
    ? undefined
    : or(sql`${parcels.siteAddress} ilike ${pattern}`, sql`${applications.number} ilike ${pattern}`)
}

function matchesTab(tab: ContractorTab): SQL | undefined {
  return tab === 'all' ? undefined : inArray(applications.state, [...TAB_STATES[tab]])
}

async function typeLabels(
  db: DbOrTx,
  apps: { applicationTypeKey: string; configPins: unknown }[],
  signal: AbortSignal,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  for (const app of apps) {
    const versionId = (app.configPins as { applicationType: string }).applicationType
    if (labels.has(versionId)) continue
    const version = await getVersion(db, versionId, signal)
    labels.set(
      versionId,
      (version?.body as ApplicationTypeBody | undefined)?.label ?? app.applicationTypeKey,
    )
  }
  return labels
}

async function countTabs(db: DbOrTx, actor: Actor, pattern: string | null): Promise<TabCounts> {
  const rows = await db
    .select({ projectId: projects.id, state: applications.state })
    .from(projects)
    .innerJoin(parcels, eq(parcels.id, projects.parcelId))
    .innerJoin(projectParties, partyJoin(actor.userId))
    .leftJoin(applications, eq(applications.projectId, projects.id))
    .where(matchesSearch(pattern))
  const sets = new Map<ContractorTab, Set<string>>(CONTRACTOR_TABS.map((t) => [t, new Set()]))
  for (const row of rows) {
    sets.get('all')?.add(row.projectId)
    const tab = row.state === null ? null : tabOfState(row.state as CoreState)
    if (tab !== null) sets.get(tab)?.add(row.projectId)
  }
  return Object.fromEntries(CONTRACTOR_TABS.map((t) => [t, sets.get(t)?.size ?? 0])) as TabCounts
}

async function pageOfProjects(db: DbOrTx, actor: Actor, input: ListInput, pattern: string | null) {
  const tab = input.tab ?? 'all'
  return await db
    .selectDistinct({
      projectId: projects.id,
      title: projects.title,
      createdAt: projects.createdAt,
      parcelId: projects.parcelId,
      siteAddress: parcels.siteAddress,
    })
    .from(projects)
    .innerJoin(parcels, eq(parcels.id, projects.parcelId))
    .innerJoin(projectParties, partyJoin(actor.userId))
    .leftJoin(applications, eq(applications.projectId, projects.id))
    .where(and(matchesTab(tab), matchesSearch(pattern)))
    .orderBy(desc(projects.createdAt), desc(projects.id))
    .offset(offsetOf(input.cursor))
    .limit(input.limit + 1)
}

async function openSources(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
  now: Date,
): Promise<{ sources: Omit<NeedSource, 'extras'>[]; ids: string[] }> {
  const rows = await db
    .selectDistinct({
      app: applications,
      siteAddress: parcels.siteAddress,
    })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .innerJoin(parcels, eq(parcels.id, projects.parcelId))
    .innerJoin(projectParties, partyJoin(actor.userId))
    .where(inArray(applications.state, [...OPEN_STATES]))
  const layer = await getLayerStatus(db, 'parcels', now, signal)
  const labels = await typeLabels(
    db,
    rows.map((r) => r.app),
    signal,
  )
  const sources = rows.map(({ app, siteAddress }) => ({
    applicationId: app.id,
    number: app.number,
    typeLabel:
      labels.get((app.configPins as { applicationType: string }).applicationType) ??
      app.applicationTypeKey,
    address: honestText(honestFromLayer(layer, siteAddress), 'Address not on file'),
  }))
  return { sources, ids: sources.map((s) => s.applicationId) }
}

export async function listContractorProjects(
  db: DbOrTx,
  actor: Actor,
  input: ListInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<ContractorDashboard> {
  signal.throwIfAborted()
  const tab = input.tab ?? 'all'
  const pattern = searchPattern(input.q)
  const offset = offsetOf(input.cursor)
  const [rows, counts, today, open] = await Promise.all([
    pageOfProjects(db, actor, input, pattern),
    countTabs(db, actor, pattern),
    townToday(db, now, signal),
    openSources(db, actor, signal, now),
  ])
  const page = rows.slice(0, input.limit)
  const projectIds = page.map((r) => r.projectId)
  const apps =
    projectIds.length === 0
      ? []
      : await db
          .select({ app: applications })
          .from(applications)
          .innerJoin(projects, eq(projects.id, applications.projectId))
          .innerJoin(parcels, eq(parcels.id, projects.parcelId))
          .where(
            and(
              inArray(applications.projectId, projectIds),
              matchesTab(tab),
              matchesSearch(pattern),
            ),
          )
          .orderBy(desc(applications.seq))
  const [labels, display, layer, extras] = await Promise.all([
    typeLabels(
      db,
      apps.map((a) => a.app),
      signal,
    ),
    displayIdsFor(db, [...new Set(page.map((r) => r.parcelId))]),
    getLayerStatus(db, 'parcels', now, signal),
    loadExtras(db, [...open.ids, ...apps.map((a) => a.app.id)], today, signal),
  ])
  const empty: ApplicationExtras = {
    dueCents: 0,
    resultsOwed: [],
    upcoming: [],
    missingDocuments: [],
  }
  const needs = needsFrom(
    open.sources.map((s) => ({ ...s, extras: extras.get(s.applicationId) ?? empty })),
    today,
  )
  const total = counts[tab]
  return {
    rows: page.map((r) => ({
      projectId: r.projectId,
      title: r.title,
      parcelDisplayId: display.get(r.parcelId) ?? null,
      siteAddress: honestFromLayer(layer, r.siteAddress),
      applications: apps
        .filter((a) => a.app.projectId === r.projectId)
        .map(({ app }) => ({
          applicationId: app.id,
          number: app.number,
          typeLabel:
            labels.get((app.configPins as { applicationType: string }).applicationType) ??
            app.applicationTypeKey,
          state: app.state as CoreState,
          issuedOn: app.issuedOn as CivilDate | null,
          ...(extras.get(app.id) ?? empty),
        })),
    })),
    needs,
    counts,
    total,
    offset,
    nextCursor: rows.length > input.limit ? String(offset + input.limit) : null,
    prevCursor: offset > 0 ? String(Math.max(0, offset - input.limit)) : null,
  }
}
