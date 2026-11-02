import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { regionalImpactDeterminations } from '@/db/schema'
import type { ProjectFacts } from '@/features/forms/validateSubmission'

export async function factsWithDeterminations(
  db: DbOrTx,
  applicationId: string,
  facts: ProjectFacts,
): Promise<ProjectFacts> {
  const [row] = await db
    .select({ determination: regionalImpactDeterminations.determination })
    .from(regionalImpactDeterminations)
    .where(eq(regionalImpactDeterminations.applicationId, applicationId))
  return { ...facts, regionalImpact: row?.determination === 'yes' }
}
