import { and, eq, isNotNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  applications,
  complaints,
  enforcementCases,
  enforcementOrders,
  ledgerEntries,
  receipts,
  rtkRequests,
} from '@/db/schema'
import type { SearchScope } from './searchScope'
import type { ExactKind, ExactRecord } from './searchTypes'

const RECORD_NUMBER = /^[A-Z0-9][A-Z0-9-]{1,39}$/

type Lookup = PromiseLike<{ id: string | null }[]> | null

interface KindLookup {
  kind: ExactKind
  href: (id: string) => string
  newTab: boolean
  lookup: Lookup
}

function lookups(db: DbOrTx, scope: SearchScope, number: string): KindLookup[] {
  const caseHref = (id: string) => `/staff/enforcement/${id}`
  const [byCase, byOrder, byComplaint] = caseLookups(db, scope, number)
  return [
    {
      kind: 'application',
      href: (id) => `/staff/applications/${id}`,
      newTab: false,
      lookup: applicationLookup(db, scope, number),
    },
    { kind: 'case', href: caseHref, newTab: false, lookup: byCase },
    { kind: 'order', href: caseHref, newTab: false, lookup: byOrder },
    { kind: 'complaint', href: caseHref, newTab: false, lookup: byComplaint },
    {
      kind: 'request',
      href: (id) => `/staff/records/requests/${id}`,
      newTab: false,
      lookup: requestLookup(db, scope, number),
    },
    {
      kind: 'receipt',
      href: (id) => `/staff/receipts/${id}`,
      newTab: true,
      lookup: receiptLookup(db, scope, number),
    },
  ]
}

function applicationLookup(db: DbOrTx, scope: SearchScope, number: string): Lookup {
  return db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.number, number), scope.applications))
}

function caseLookups(db: DbOrTx, scope: SearchScope, number: string): [Lookup, Lookup, Lookup] {
  if (!scope.cases) return [null, null, null]
  return [
    db
      .select({ id: enforcementCases.id })
      .from(enforcementCases)
      .where(eq(enforcementCases.number, number)),
    db
      .select({ id: enforcementOrders.caseId })
      .from(enforcementOrders)
      .where(eq(enforcementOrders.number, number)),
    db
      .select({ id: complaints.caseId })
      .from(complaints)
      .where(and(eq(complaints.number, number), isNotNull(complaints.caseId))),
  ]
}

function requestLookup(db: DbOrTx, scope: SearchScope, number: string): Lookup {
  if (!scope.requests) return null
  return db.select({ id: rtkRequests.id }).from(rtkRequests).where(eq(rtkRequests.number, number))
}

function receiptLookup(db: DbOrTx, scope: SearchScope, number: string): Lookup {
  if (scope.receipts === null) return null
  return db
    .select({ id: receipts.id })
    .from(receipts)
    .innerJoin(ledgerEntries, eq(ledgerEntries.receiptId, receipts.id))
    .where(and(eq(receipts.number, number), scope.receipts))
    .limit(1)
}

export function recordNumberOf(query: string): string | null {
  const number = query.trim().toUpperCase()
  return RECORD_NUMBER.test(number) ? number : null
}

export async function findExactRecord(
  db: DbOrTx,
  scope: SearchScope,
  query: string,
  signal: AbortSignal,
): Promise<ExactRecord | null> {
  signal.throwIfAborted()
  const number = recordNumberOf(query)
  if (number === null) return null
  const kinds = lookups(db, scope, number)
  const found = await Promise.all(kinds.map((k) => k.lookup ?? Promise.resolve([])))
  for (const [index, rows] of found.entries()) {
    const id = rows[0]?.id ?? null
    const kind = kinds.at(index)
    if (id !== null && kind !== undefined)
      return { kind: kind.kind, number, href: kind.href(id), newTab: kind.newTab }
  }
  return null
}
