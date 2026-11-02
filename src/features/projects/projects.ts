import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { parcels, projectParties, projects } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { err, ok, type Result } from '@/types/result'

export async function createProject(
  db: Db,
  actor: Actor,
  input: { parcelId: string; title: string },
  signal: AbortSignal,
): Promise<Result<{ projectId: string }, 'unknown_parcel'>> {
  signal.throwIfAborted()
  return await transactionResult(db, async (tx) => {
    const [parcel] = await tx
      .select({ id: parcels.id })
      .from(parcels)
      .where(eq(parcels.id, input.parcelId))
    if (parcel === undefined) return err('unknown_parcel')
    const [project] = await tx
      .insert(projects)
      .values({ parcelId: input.parcelId, title: input.title, createdBy: actor.userId })
      .returning({ id: projects.id })
    const projectId = project?.id ?? ''
    if (actor.kind === 'public') {
      await tx.insert(projectParties).values({
        projectId,
        userId: actor.userId,
        name: 'Applicant',
        role: 'applicant',
        addedBy: actor.userId,
      })
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'project.create',
        entityType: 'project',
        entityId: projectId,
        after: { parcelId: input.parcelId, title: input.title },
      },
      signal,
    )
    return ok({ projectId })
  })
}
