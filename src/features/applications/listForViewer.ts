import { and, desc, eq, lt } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, projects } from '@/db/schema'
import { applicationVisibleTo } from '@/features/access/predicates'
import type { Actor } from '@/features/auth/actor'

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
    .where(and(applicationVisibleTo(actor), afterClause))
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

export async function getApplicationForViewer(
  db: DbOrTx,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<ApplicationListRow | null> {
  signal.throwIfAborted()
  const [row] = await db
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
    .where(and(eq(applications.id, applicationId), applicationVisibleTo(actor)))
    .limit(1)
  return row ?? null
}
