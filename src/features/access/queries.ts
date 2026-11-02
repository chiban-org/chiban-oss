import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, projectParties, projects } from '@/db/schema'
import { applicationVisibleTo, projectVisibleTo } from '@/features/access/predicates'
import type { PartyRole } from '@/features/access/roles'
import type { Actor } from '@/features/auth/actor'

export async function canViewApplication(
  db: DbOrTx,
  actor: Actor | null,
  applicationId: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  const rows = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, applicationId), applicationVisibleTo(actor)))
    .limit(1)
  return rows.length > 0
}

export async function canViewProject(
  db: DbOrTx,
  actor: Actor | null,
  projectId: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), projectVisibleTo(actor)))
    .limit(1)
  return rows.length > 0
}

export async function countApplicationsForViewer(
  db: DbOrTx,
  actor: Actor | null,
  signal: AbortSignal,
): Promise<number> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(applications)
    .where(applicationVisibleTo(actor))
  return row?.n ?? 0
}

export async function isProjectParty(
  db: DbOrTx,
  actor: Actor,
  projectId: string,
  roles: PartyRole[],
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  const rows = await db
    .select({ id: projectParties.id })
    .from(projectParties)
    .where(
      and(
        eq(projectParties.projectId, projectId),
        eq(projectParties.userId, actor.userId),
        isNull(projectParties.removedAt),
        inArray(projectParties.role, roles),
      ),
    )
    .limit(1)
  return rows.length > 0
}
