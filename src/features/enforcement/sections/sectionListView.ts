import { asc, desc } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { type TownSectionRow, townSections } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import {
  loadTownRefs,
  loadUsedRefs,
  stateCodeRefs,
} from '@/features/enforcement/sections/suggestionInputs'
import { notOnList, type TypedRef } from '@/features/enforcement/sections/suggestions'

export interface SectionListView {
  rows: TownSectionRow[]
  typedNotListed: TypedRef[]
}

export async function loadSectionListView(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
): Promise<SectionListView | null> {
  if (!(await requireCapability(db, actor.userId, 'config.edit', signal)).ok) return null
  const rows = await db
    .select()
    .from(townSections)
    .orderBy(
      desc(townSections.active),
      asc(townSections.provisionKind),
      asc(townSections.reference),
    )
  const typedNotListed = notOnList({
    used: await loadUsedRefs(db, signal),
    town: await loadTownRefs(db, signal),
    conditions: [],
    stateCode: stateCodeRefs(),
  })
  return { rows, typedNotListed }
}
