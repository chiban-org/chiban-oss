import { and, desc, eq, exists, isNull, lt, type SQL } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, projectParties, projects } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasFullRecordAccess } from '@/features/projects/access'

export interface ApplicationListRow {
  id: string
  seq: number
  number: string
  applicationTypeKey: string
  state: string
  substep: string | null
  projectId: string
  projectTitle: string
  parcelId: string
  createdAt: Date
}

export interface ApplicationPage {
  rows: ApplicationListRow[]
  nextCursor: string | null
}

function decodeCursor(cursor: string): number | null {
  const seq = Number(cursor)
  return Number.isSafeInteger(seq) ? seq : null
}

function visibleTo(db: DbOrTx, actor: Actor): SQL | undefined {
  if (hasFullRecordAccess(actor)) return undefined
  return exists(
    db
      .select({ one: projectParties.id })
      .from(projectParties)
      .where(
        and(
          eq(projectParties.projectId, applications.projectId),
          eq(projectParties.userId, actor.userId),
          isNull(projectParties.removedAt),
        ),
      ),
  )
}

export async function listApplicationsForViewer(
  db: DbOrTx,
  actor: Actor,
  input: { limit: number; cursor?: string },
  signal: AbortSignal,
): Promise<ApplicationPage> {
  signal.throwIfAborted()
  const after = input.cursor === undefined ? null : decodeCursor(input.cursor)
  const afterClause = after === null ? undefined : lt(applications.seq, after)
  const rows = await db
    .select({
      id: applications.id,
      seq: applications.seq,
      number: applications.number,
      applicationTypeKey: applications.applicationTypeKey,
      state: applications.state,
      substep: applications.substep,
      projectId: applications.projectId,
      projectTitle: projects.title,
      parcelId: projects.parcelId,
      createdAt: applications.createdAt,
    })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(and(visibleTo(db, actor), afterClause))
    .orderBy(desc(applications.seq))
    .limit(input.limit + 1)
  const page = rows.slice(0, input.limit)
  const last = page.at(-1)
  const hasMore = rows.length > input.limit
  return {
    rows: page,
    nextCursor: hasMore && last !== undefined ? String(last.seq) : null,
  }
}
