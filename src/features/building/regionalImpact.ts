import { and, desc, eq, inArray, ne } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import {
  applications,
  clocks,
  regionalImpactDeterminations,
  regionalImpactNotices,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { REGIONAL_IMPACT_OPEN_STATES } from '@/features/building/regionalImpactStates'
import { startClocksFor } from '@/features/clocks/startClocks'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const COMMENT_CLOCK_KEY = 'nh.bp.regional_impact_comment'
const CERTIFIED_KINDS = ['regional_planning_commission', 'affected_municipality'] as const

export type Determination = 'yes' | 'no' | 'previously_determined'

async function stillBeforeIssuance(tx: Tx, applicationId: string): Promise<boolean> {
  const [row] = await tx
    .select({ state: applications.state })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .for('update')
  return row !== undefined && REGIONAL_IMPACT_OPEN_STATES.includes(row.state)
}

export async function recordRegionalImpactDetermination(
  db: Db,
  actor: Actor,
  input: {
    applicationId: string
    determination: Determination
    previousBoardRef?: string
    determinedOn: CivilDate
  },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'board_ref_required' | 'after_issuance'>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'regional_impact.determine', signal))) {
    return err('forbidden')
  }
  const ref = input.previousBoardRef?.trim() ?? ''
  if (input.determination === 'previously_determined' && ref === '')
    return err('board_ref_required')
  return await transactionResult(db, async (tx) => {
    if (!(await stillBeforeIssuance(tx, input.applicationId))) return err('after_issuance')
    const values = {
      applicationId: input.applicationId,
      determination: input.determination,
      previousBoardRef: input.determination === 'previously_determined' ? ref : null,
      determinedOn: input.determinedOn,
      determinedBy: actor.userId,
    }
    await tx
      .insert(regionalImpactDeterminations)
      .values(values)
      .onConflictDoUpdate({ target: regionalImpactDeterminations.applicationId, set: values })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'regional_impact.determine',
        entityType: 'application',
        entityId: input.applicationId,
        after: { determination: input.determination, previousBoardRef: values.previousBoardRef },
      },
      signal,
    )
    return ok(undefined)
  })
}

async function restartCommentClock(
  tx: Tx,
  applicationId: string,
  signal: AbortSignal,
): Promise<void> {
  const [latest] = await tx
    .select({ mailedOn: regionalImpactNotices.mailedOn })
    .from(regionalImpactNotices)
    .where(
      and(
        eq(regionalImpactNotices.applicationId, applicationId),
        eq(regionalImpactNotices.method, 'certified_mail'),
        inArray(regionalImpactNotices.recipientKind, [...CERTIFIED_KINDS]),
      ),
    )
    .orderBy(desc(regionalImpactNotices.mailedOn))
    .limit(1)
  if (latest === undefined) return
  const live = await tx
    .select()
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        eq(clocks.ruleKey, COMMENT_CLOCK_KEY),
        ne(clocks.status, 'superseded'),
      ),
    )
  if (live.some((c) => c.startDate === latest.mailedOn)) return
  for (const old of live) {
    await tx
      .update(clocks)
      .set({ status: 'superseded', supersededReason: 'later_certified_notice' })
      .where(eq(clocks.id, old.id))
  }
  await startClocksFor(
    tx,
    applicationId,
    'regional_impact_notice_mailed',
    latest.mailedOn as CivilDate,
    signal,
  )
  const [fresh] = await tx
    .select({ id: clocks.id })
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        eq(clocks.ruleKey, COMMENT_CLOCK_KEY),
        eq(clocks.status, 'running'),
      ),
    )
  if (fresh === undefined) return
  for (const old of live) {
    await tx.update(clocks).set({ supersededBy: fresh.id }).where(eq(clocks.id, old.id))
  }
}

export interface NoticeInput {
  applicationId: string
  recipientKind: 'governing_body' | 'regional_planning_commission' | 'affected_municipality'
  recipientName: string
  method: 'certified_mail' | 'hand_delivery' | 'email' | 'other'
  mailedOn: CivilDate
  reference?: string
}

export async function recordRegionalImpactNotice(
  db: Db,
  actor: Actor,
  input: NoticeInput,
  signal: AbortSignal,
): Promise<
  Result<void, 'forbidden' | 'certified_mail_required' | 'no_yes_determination' | 'after_issuance'>
> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'regional_impact.determine', signal))) {
    return err('forbidden')
  }
  const needsCertified = (CERTIFIED_KINDS as readonly string[]).includes(input.recipientKind)
  if (needsCertified && input.method !== 'certified_mail') return err('certified_mail_required')
  return await transactionResult(db, async (tx) => {
    if (!(await stillBeforeIssuance(tx, input.applicationId))) return err('after_issuance')
    const [determination] = await tx
      .select()
      .from(regionalImpactDeterminations)
      .where(eq(regionalImpactDeterminations.applicationId, input.applicationId))
    if (determination?.determination !== 'yes') return err('no_yes_determination')
    await tx.insert(regionalImpactNotices).values({
      applicationId: input.applicationId,
      recipientKind: input.recipientKind,
      recipientName: input.recipientName,
      method: input.method,
      mailedOn: input.mailedOn,
      reference: input.reference ?? null,
      recordedBy: actor.userId,
    })
    if (needsCertified) await restartCommentClock(tx, input.applicationId, signal)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'regional_impact.notice',
        entityType: 'application',
        entityId: input.applicationId,
        after: {
          recipientKind: input.recipientKind,
          method: input.method,
          mailedOn: input.mailedOn,
        },
      },
      signal,
    )
    return ok(undefined)
  })
}
