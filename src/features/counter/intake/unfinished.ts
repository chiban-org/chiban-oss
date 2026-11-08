import { and, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  applications,
  configVersions,
  counterIntakes,
  parcels,
  projectParties,
  projects,
  users,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { transitionApplication } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { mayUseCounter } from '@/features/counter/counterAccess'
import { displayIdsFor } from '@/features/parcels/displayId'
import { err, ok, type Result } from '@/types/result'

export const UNFINISHED_LIMIT = 50

export interface UnfinishedIntake {
  applicationId: string
  number: string
  typeLabel: string
  parcelLabel: string
  applicantName: string
  takenByName: string
  takenAt: Date
}

export async function listUnfinishedIntakes(
  db: Db,
  signal: AbortSignal,
): Promise<UnfinishedIntake[]> {
  signal.throwIfAborted()
  const rows = await db
    .select({
      applicationId: applications.id,
      number: applications.number,
      typeLabel: sql<string>`${configVersions.body}->>'label'`,
      parcelId: projects.parcelId,
      siteAddress: parcels.siteAddress,
      applicantName: projectParties.name,
      takenByName: users.displayName,
      takenAt: counterIntakes.takenAt,
    })
    .from(counterIntakes)
    .innerJoin(applications, eq(applications.id, counterIntakes.applicationId))
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .innerJoin(parcels, eq(parcels.id, projects.parcelId))
    .innerJoin(projectParties, eq(projectParties.id, counterIntakes.applicantPartyId))
    .innerJoin(
      configVersions,
      eq(configVersions.id, sql`(${applications.configPins}->>'applicationType')::uuid`),
    )
    .leftJoin(users, eq(users.id, counterIntakes.takenBy))
    .where(eq(applications.state, 'draft'))
    .orderBy(desc(counterIntakes.takenAt))
    .limit(UNFINISHED_LIMIT)
  const display = await displayIdsFor(
    db,
    rows.map((r) => r.parcelId),
  )
  return rows.map((r) => ({
    applicationId: r.applicationId,
    number: r.number,
    typeLabel: r.typeLabel,
    parcelLabel: [display.get(r.parcelId), r.siteAddress].filter(Boolean).join(', '),
    applicantName: r.applicantName,
    takenByName: r.takenByName ?? 'Former user',
    takenAt: r.takenAt,
  }))
}

export type DiscardError = 'forbidden' | 'not_unfinished'

export async function discardCounterIntake(
  db: Db,
  actor: Actor,
  input: { applicationId: string },
  signal: AbortSignal,
): Promise<Result<void, DiscardError>> {
  signal.throwIfAborted()
  if (!(await mayUseCounter(db, actor, signal))) return err('forbidden')
  const [row] = await db
    .select({ rowVersion: applications.rowVersion })
    .from(counterIntakes)
    .innerJoin(applications, eq(applications.id, counterIntakes.applicationId))
    .where(
      and(eq(counterIntakes.applicationId, input.applicationId), eq(applications.state, 'draft')),
    )
  if (row === undefined) return err('not_unfinished')
  return await transactionResult<void, DiscardError>(db, async (tx) => {
    const moved = await transitionApplication(
      tx,
      actor,
      { applicationId: input.applicationId, to: 'withdrawn', expectedRowVersion: row.rowVersion },
      signal,
    )
    if (moved.ok) return ok(undefined)
    return err(moved.error === 'forbidden' ? 'forbidden' : 'not_unfinished')
  })
}
