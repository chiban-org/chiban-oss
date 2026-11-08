import { stateCodeReference, stateCodeSectionsFor } from '@packs/nh/buildingCodeSections'
import { and, asc, desc, eq, isNotNull, ne, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  applicationConditions,
  applications,
  boardDecisions,
  codeEditionRecords,
  projects,
  townSections,
  violationFindings,
} from '@/db/schema'
import { resolveCodeEdition } from '@/features/building/codeEdition'
import {
  type ConditionRef,
  mergeSuggestions,
  type StateRef,
  type SuggestionInputs,
  type SuggestionsByKind,
  type TownRef,
  type UsedRef,
} from '@/features/enforcement/sections/suggestions'
import { loadPack } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

const REF_MAX = 300

function clamp(text: string): string {
  return text.length <= REF_MAX ? text : `${text.slice(0, REF_MAX - 3).trimEnd()}...`
}

export async function loadUsedRefs(db: DbOrTx, signal: AbortSignal): Promise<UsedRef[]> {
  signal.throwIfAborted()
  const key = sql`lower(regexp_replace(trim(${violationFindings.provisionRef}), '\\s+', ' ', 'g'))`
  return await db
    .select({
      kind: violationFindings.provisionKind,
      ref: sql<string>`mode() within group (order by trim(${violationFindings.provisionRef}) collate "C")`,
      count: sql<number>`count(*)::int`,
    })
    .from(violationFindings)
    .where(ne(violationFindings.status, 'withdrawn'))
    .groupBy(violationFindings.provisionKind, key)
}

export async function loadTownRefs(db: DbOrTx, signal: AbortSignal): Promise<TownRef[]> {
  signal.throwIfAborted()
  return await db
    .select({
      kind: townSections.provisionKind,
      reference: townSections.reference,
      title: townSections.title,
    })
    .from(townSections)
    .where(eq(townSections.active, true))
    .orderBy(asc(townSections.provisionKind), asc(townSections.reference))
}

async function permitConditions(db: DbOrTx, parcelId: string): Promise<ConditionRef[]> {
  const rows = await db
    .select({
      number: applications.number,
      code: applicationConditions.code,
      text: applicationConditions.textSnapshot,
    })
    .from(applicationConditions)
    .innerJoin(applications, eq(applications.id, applicationConditions.applicationId))
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(and(eq(projects.parcelId, parcelId), isNotNull(applications.issuedOn)))
    .orderBy(desc(applications.issuedOn), asc(applications.number), asc(applicationConditions.code))
  return rows.flatMap((r) => {
    const value = clamp(`${r.number} condition ${r.code}: ${r.text}`)
    return [
      { kind: 'permit_condition' as const, value, on: r.number },
      { kind: 'approved_plan' as const, value, on: r.number },
    ]
  })
}

async function decisionConditions(db: DbOrTx, parcelId: string): Promise<ConditionRef[]> {
  const rows = await db
    .select({ number: applications.number, conditions: boardDecisions.conditions })
    .from(boardDecisions)
    .innerJoin(applications, eq(applications.id, boardDecisions.applicationId))
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(eq(projects.parcelId, parcelId))
    .orderBy(desc(boardDecisions.votedOn), asc(applications.number))
  return rows.flatMap((r) =>
    r.conditions.map((c) => ({
      kind: 'board_decision' as const,
      value: clamp(`${r.number} decision condition ${c.code}: ${c.text}`),
      on: `the ${r.number} decision`,
    })),
  )
}

export async function loadConditionRefs(
  db: DbOrTx,
  parcelId: string | null,
  signal: AbortSignal,
): Promise<ConditionRef[]> {
  signal.throwIfAborted()
  if (parcelId === null) return []
  return [...(await permitConditions(db, parcelId)), ...(await decisionConditions(db, parcelId))]
}

export function stateCodeRefs(editionKeys: readonly string[]): StateRef[] {
  return stateCodeSectionsFor(editionKeys).map((s) => ({
    reference: stateCodeReference(s),
    title: s.title,
    topic: s.topic,
  }))
}

export interface SuggestionScope {
  parcelId: string | null
  today: CivilDate
}

function editionOn(date: CivilDate): string[] {
  const resolved = resolveCodeEdition(loadPack().codeEditions, date)
  return resolved.ok ? [resolved.value.editionKey] : []
}

async function parcelPermitEditions(db: DbOrTx, parcelId: string | null): Promise<string[]> {
  if (parcelId === null) return []
  const rows = await db
    .select({ editionKey: codeEditionRecords.editionKey })
    .from(codeEditionRecords)
    .innerJoin(applications, eq(applications.id, codeEditionRecords.applicationId))
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(and(eq(projects.parcelId, parcelId), isNotNull(applications.issuedOn)))
    .orderBy(desc(applications.issuedOn))
  return rows.map((r) => r.editionKey)
}

export async function suggestedEditions(
  db: DbOrTx,
  scope: SuggestionScope,
  signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted()
  const keys = [...editionOn(scope.today), ...(await parcelPermitEditions(db, scope.parcelId))]
  return [...new Set(keys)]
}

export async function loadSuggestionInputs(
  db: DbOrTx,
  scope: SuggestionScope,
  signal: AbortSignal,
): Promise<SuggestionInputs> {
  return {
    used: await loadUsedRefs(db, signal),
    town: await loadTownRefs(db, signal),
    conditions: await loadConditionRefs(db, scope.parcelId, signal),
    stateCode: stateCodeRefs(await suggestedEditions(db, scope, signal)),
  }
}

export async function loadFindingSuggestions(
  db: DbOrTx,
  scope: SuggestionScope,
  signal: AbortSignal,
): Promise<SuggestionsByKind> {
  return mergeSuggestions(await loadSuggestionInputs(db, scope, signal))
}
