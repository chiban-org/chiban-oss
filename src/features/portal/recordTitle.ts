import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications, projects } from '@/db/schema'
import { canViewApplication } from '@/features/access/queries'
import type { Actor } from '@/features/auth/actor'
import { isUuid } from '@/utils/uuid'

export async function portalRecordTitle(
  db: Db,
  actor: Actor | null,
  applicationId: string,
  signal: AbortSignal,
): Promise<string | null> {
  if (actor === null || !isUuid(applicationId)) return null
  if (!(await canViewApplication(db, actor, applicationId, signal))) return null
  const [row] = await db
    .select({ title: projects.title, number: applications.number })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(eq(applications.id, applicationId))
  return row === undefined ? null : `${row.title} (${row.number})`
}
