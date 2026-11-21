import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, Tx } from '@/db/client'
import { enforcementCases, enforcementCivilActions } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { lockCase } from '@/features/enforcement/cases'
import { cureStatus } from '@/features/enforcement/cureNotices'
import { cureRuleByKey } from '@/features/enforcement/cureRules'
import { holdsEnabled } from '@/features/enforcement/holdReads'
import { civilDateSchema } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

type Remedy = 'developmentHold' | 'civilAction'
export type RemedyError = 'not_found' | 'remedy_not_available' | 'cure_not_lapsed'

export async function lockedRemedyOpen(
  tx: Tx,
  input: { caseId: string; remedy: Remedy; on: CivilDate },
  signal: AbortSignal,
): Promise<Result<typeof enforcementCases.$inferSelect, RemedyError | 'no_parcel'>> {
  const { caseId, remedy, on } = input
  await lockCase(tx, caseId)
  const [row] = await tx.select().from(enforcementCases).where(eq(enforcementCases.id, caseId))
  if (row === undefined) return err('not_found')
  if (remedy === 'developmentHold' && row.parcelId === null) return err('no_parcel')
  const rule = cureRuleByKey(row.cureRuleKey)
  const offered =
    remedy === 'developmentHold'
      ? rule?.remedies.developmentHold === true && holdsEnabled()
      : rule?.remedies.civilAction === true
  if (!offered) return err('remedy_not_available')
  const status = await cureStatus(tx, caseId, on, signal)
  return status.lapsedUncorrected ? ok(row) : err('cure_not_lapsed')
}

const CivilActionSchema = z.object({
  caseId: z.string().uuid(),
  filedOn: civilDateSchema,
  court: z.string().trim().min(1).max(200),
  docket: z.string().trim().min(1).max(100).nullable(),
})

export async function recordCivilAction(
  db: Db,
  actor: Actor,
  input: { caseId: string; filedOn: CivilDate; court: string; docket: string | null },
  signal: AbortSignal,
): Promise<Result<{ civilActionId: string }, 'forbidden' | 'invalid' | RemedyError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = CivilActionSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult<{ civilActionId: string }, 'forbidden' | 'invalid' | RemedyError>(
    db,
    async (tx) => {
      const open = await lockedRemedyOpen(
        tx,
        { caseId: value.caseId, remedy: 'civilAction', on: value.filedOn },
        signal,
      )
      if (!open.ok) return err(open.error === 'no_parcel' ? 'not_found' : open.error)
      const [row] = await tx
        .insert(enforcementCivilActions)
        .values({
          caseId: value.caseId,
          filedOn: value.filedOn,
          court: value.court,
          docket: value.docket,
          recordedBy: actor.userId,
        })
        .returning({ id: enforcementCivilActions.id })
      const civilActionId = row?.id ?? ''
      await writeAudit(
        tx,
        {
          actor: { kind: 'user', userId: actor.userId },
          action: 'enforcement.civil_action_recorded',
          entityType: 'enforcement_case',
          entityId: value.caseId,
          after: { civilActionId, filedOn: value.filedOn, court: value.court },
        },
        signal,
      )
      return ok({ civilActionId })
    },
  )
}
