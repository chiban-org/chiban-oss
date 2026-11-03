import { and, or, type SQL, sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { DbOrTx } from '@/db/client'

export type GroupClauses<G extends string> = ReadonlyMap<G, SQL | undefined>

export type FacetCounts<G extends string> = ReadonlyMap<G, ReadonlyMap<string, number>>

export interface FacetGroup<G extends string> {
  group: G
  options: readonly (readonly [string, SQL])[]
}

export function anyOf(clauses: readonly SQL[]): SQL | undefined {
  return clauses.length === 0 ? undefined : or(...clauses)
}

export function whereAll<G extends string>(
  scope: readonly (SQL | undefined)[],
  groups: GroupClauses<G>,
  except?: G,
): SQL {
  const rest = [...groups].filter(([group]) => group !== except).map(([, clause]) => clause)
  return and(...scope, ...rest) ?? sql`true`
}

export function facet<G extends string, V extends string>(
  group: G,
  values: readonly V[],
  clause: (value: V) => SQL,
): FacetGroup<G> {
  return { group, options: values.map((value) => [value, clause(value)] as const) }
}

export async function countFacets<G extends string>(
  db: DbOrTx,
  input: {
    table: PgTable
    scope: SQL
    facets: readonly FacetGroup<G>[]
    others: (group: G) => SQL
  },
): Promise<FacetCounts<G>> {
  const columns = input.facets.flatMap(({ group, options }) => {
    const others = input.others(group)
    return options.map(([value, clause]): [string, SQL<number>] => [
      `${group}:${value}`,
      sql<number>`(count(*) filter (where ${clause} and ${others}))::int`,
    ])
  })
  const [row] = await db.select(Object.fromEntries(columns)).from(input.table).where(input.scope)
  const found = new Map(Object.entries(row ?? {}))
  return new Map(
    input.facets.map(({ group, options }) => [
      group,
      new Map(options.map(([value]) => [value, found.get(`${group}:${value}`) ?? 0])),
    ]),
  )
}
