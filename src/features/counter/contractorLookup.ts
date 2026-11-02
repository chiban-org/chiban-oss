import { and, desc, eq, ilike, isNotNull, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { licenseChecks, projectParties } from '@/db/schema'

const LIMIT = 10

export interface ContractorMatch {
  name: string
  email: string | null
  licenseNumber: string | null
}

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export async function searchContractors(
  db: DbOrTx,
  q: string,
  signal: AbortSignal,
): Promise<ContractorMatch[]> {
  signal.throwIfAborted()
  const term = q.trim()
  if (term === '') return []
  const parties = await db
    .selectDistinctOn([projectParties.name, projectParties.email], {
      name: projectParties.name,
      email: projectParties.email,
      projectId: projectParties.projectId,
    })
    .from(projectParties)
    .where(
      and(
        eq(projectParties.role, 'contractor'),
        ilike(projectParties.name, `${escapeLike(term)}%`),
      ),
    )
    .orderBy(projectParties.name, projectParties.email, desc(projectParties.addedAt))
    .limit(LIMIT)
  const results: ContractorMatch[] = []
  for (const party of parties) {
    const [license] = await db
      .select({ licenseNumber: licenseChecks.licenseNumber })
      .from(licenseChecks)
      .where(
        and(
          isNotNull(licenseChecks.licenseNumber),
          sql`${licenseChecks.applicationId} in (select id from applications where project_id = ${party.projectId})`,
        ),
      )
      .orderBy(desc(licenseChecks.checkedAt))
      .limit(1)
    results.push({
      name: party.name,
      email: party.email,
      licenseNumber: license?.licenseNumber ?? null,
    })
  }
  return results
}
