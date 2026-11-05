import type { DbOrTx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { townToday } from '@/features/town/today'
import { applicationMatches } from './applicationMatches'
import { findExactRecord } from './exactRecord'
import { caseMatches, parcelMatches, requestMatches } from './recordMatches'
import { loadSearchScope } from './searchScope'
import { MIN_SEARCH_CHARS, type SearchGroup, type SearchResult } from './searchTypes'

export async function findRecords(
  db: DbOrTx,
  actor: Actor,
  rawQuery: string,
  signal: AbortSignal,
): Promise<SearchResult> {
  const query = rawQuery.trim()
  if (query.length < MIN_SEARCH_CHARS) return { query, exact: null, groups: [] }
  const [scope, today] = await Promise.all([
    loadSearchScope(db, actor, signal),
    townToday(db, new Date(), signal),
  ])
  const none = Promise.resolve(null)
  const [exact, ...groups] = await Promise.all([
    findExactRecord(db, scope, query, signal),
    applicationMatches(db, scope, query, signal),
    scope.cases ? caseMatches(db, query) : none,
    parcelMatches(db, query, signal),
    scope.requests ? requestMatches(db, query, today) : none,
  ])
  return {
    query,
    exact,
    groups: groups.filter((g): g is SearchGroup => g !== null && g.rows.length > 0),
  }
}
