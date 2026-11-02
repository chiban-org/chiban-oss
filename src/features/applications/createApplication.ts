import { eq, sql } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'
import { applicationNumberCounters, applications, projects } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { pinCurrent } from '@/features/config/bindings'
import { checkApplicationType } from '@/features/config/publishChecks'
import { getVersion } from '@/features/config/store'
import { linkRecordToParcel } from '@/features/parcels/recordLinks'
import { hasFullRecordAccess, isActiveParty } from '@/features/projects/access'
import { getTownSettings } from '@/features/town/settings'
import { civilYear, todayInTimeZone } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const FALLBACK_TIME_ZONE = 'UTC'
const SEQUENCE_WIDTH = 4

export async function nextNumber(tx: Tx, prefix: string, year: number): Promise<string> {
  const [row] = await tx
    .insert(applicationNumberCounters)
    .values({ prefix, year, last: 1 })
    .onConflictDoUpdate({
      target: [applicationNumberCounters.prefix, applicationNumberCounters.year],
      set: { last: sql`${applicationNumberCounters.last} + 1` },
    })
    .returning({ last: applicationNumberCounters.last })
  return `${prefix}-${year}-${String(row?.last ?? 1).padStart(SEQUENCE_WIDTH, '0')}`
}

export async function createApplication(
  db: DbOrTx,
  actor: Actor,
  input: { projectId: string; applicationTypeKey: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<
    { applicationId: string; number: string },
    'forbidden' | 'not_published' | 'config_inconsistent'
  >
> {
  signal.throwIfAborted()
  const permitted =
    hasFullRecordAccess(actor) || (await isActiveParty(db, actor.userId, input.projectId))
  if (!permitted) return err('forbidden')
  const town = await getTownSettings(db, signal)
  const timeZone = town.ok ? town.value.timeZone : FALLBACK_TIME_ZONE
  const year = civilYear(todayInTimeZone(timeZone, now))
  return await transactionResult(db, async (tx) => {
    const [project] = await tx.select().from(projects).where(eq(projects.id, input.projectId))
    if (project === undefined) return err('forbidden')
    const pins = await pinCurrent(tx, input.applicationTypeKey, signal)
    if (!pins.ok) return err('not_published')
    const typeVersion = await getVersion(tx, pins.value.applicationType, signal)
    const typeBody = typeVersion?.body as ApplicationTypeBody
    if ((await checkApplicationType(tx, typeBody, signal)) !== null)
      return err('config_inconsistent')
    const prefix = typeBody.prefix
    const number = await nextNumber(tx, prefix, year)
    const [created] = await tx
      .insert(applications)
      .values({
        projectId: input.projectId,
        number,
        applicationTypeKey: input.applicationTypeKey,
        configPins: pins.value,
        createdBy: actor.userId,
      })
      .returning({ id: applications.id })
    const applicationId = created?.id ?? ''
    await linkRecordToParcel(
      tx,
      { recordKind: 'application', recordId: applicationId, parcelId: project.parcelId },
      signal,
    )
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'application.create',
        entityType: 'application',
        entityId: applicationId,
        after: { number, applicationTypeKey: input.applicationTypeKey },
      },
      signal,
    )
    return ok({ applicationId, number })
  })
}
