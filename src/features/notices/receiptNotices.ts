import { and, eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { clocks, noticeSets } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { hasOpenRegeneration } from '@/features/abutters/staleList'
import { loadApplicationContext } from '@/features/applications/context'
import { lockApplication } from '@/features/applications/lockApplication'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { markClockMet } from '@/features/clocks/startClocks'
import { type DeriveError, deriveNoticeItems } from '@/features/notices/deriveItems'
import { type NoticeStatus, noticeStatus } from '@/features/notices/noticeStatus'
import { hasReceiptNotices } from '@/features/notices/requirementsFor'
import { loadPack } from '@/features/packs/loadPack'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const RECEIPT_SUBJECT = 'receipt'

export type ReceiptNoticeError =
  | 'forbidden'
  | 'not_found'
  | 'no_receipt_requirements'
  | 'already_prepared'
  | DeriveError

export async function prepareReceiptNotices(
  db: Db,
  actor: Actor,
  input: { applicationId: string },
  signal: AbortSignal,
): Promise<Result<{ noticeSetId: string }, ReceiptNoticeError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  return await transactionResult<{ noticeSetId: string }, ReceiptNoticeError>(db, async (tx) => {
    if ((await lockApplication(tx, input.applicationId)) === null) return err('not_found')
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app === null || app.receivedDate === null) return err('not_found')
    const classification = loadPack().classifications.find(
      (c) => c.key === app.typeBody.classification,
    )
    if (classification === undefined || !hasReceiptNotices(classification)) {
      return err('no_receipt_requirements')
    }
    const [existing] = await tx
      .select({ id: noticeSets.id })
      .from(noticeSets)
      .where(and(eq(noticeSets.subjectKind, RECEIPT_SUBJECT), eq(noticeSets.subjectId, app.id)))
    if (existing !== undefined) return err('already_prepared')
    if (await hasOpenRegeneration(tx, app.id)) return err('list_out_of_date')
    const derived = await deriveNoticeItems(
      tx,
      {
        subjectKind: RECEIPT_SUBJECT,
        subjectId: app.id,
        applicationId: app.id,
        anchorDate: app.receivedDate,
        stage: 'on_receipt',
      },
      signal,
    )
    if (!derived.ok) return err(derived.error)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'notice.receipt.prepare',
        entityType: 'application',
        entityId: app.id,
        after: { noticeSetId: derived.value.setId, items: derived.value.items },
      },
      signal,
    )
    return ok({ noticeSetId: derived.value.setId })
  })
}

function leadKeyOf(requirementKey: string): string | null {
  const rule = loadPack().rules.find((r) => r.key === requirementKey)
  return rule?.kind === 'notice_requirement' ? rule.leadRuleKey : null
}

async function lockReceiptSet(tx: Tx, setId: string) {
  const [set] = await tx.select().from(noticeSets).where(eq(noticeSets.id, setId)).for('update')
  return set
}

function latestProofDate(items: NoticeStatus['items']): CivilDate | undefined {
  return items
    .flatMap((i) => (i.proof === null ? [] : [i.proof.effectiveOn]))
    .sort((x, y) => compareCivil(x, y))
    .at(-1)
}

export async function syncReceiptClocks(tx: Tx, setId: string, signal: AbortSignal) {
  const set = await lockReceiptSet(tx, setId)
  const status = await noticeStatus(tx, setId, signal)
  if (set?.subjectKind !== RECEIPT_SUBJECT || set.applicationId === null) return status
  const leadKeys = new Set(
    status.items.flatMap((i) => {
      const key = i.source === 'pack_rule' ? leadKeyOf(i.requirementKey) : null
      return key === null ? [] : [key]
    }),
  )
  for (const leadKey of leadKeys) {
    const items = status.items.filter(
      (i) => i.source === 'pack_rule' && leadKeyOf(i.requirementKey) === leadKey,
    )
    const [clock] = await tx
      .select()
      .from(clocks)
      .where(and(eq(clocks.applicationId, set.applicationId), eq(clocks.ruleKey, leadKey)))
    if (clock === undefined) continue
    const noticed = items.every((i) => i.state === 'proved_on_time')
    const last = latestProofDate(items) ?? (clock.currentDue as CivilDate)
    if (noticed && clock.status !== 'met') {
      await markClockMet(tx, set.applicationId, leadKey, last, signal)
    }
    if (noticed && clock.status === 'met' && clock.metOn !== last) {
      await tx.update(clocks).set({ metOn: last }).where(eq(clocks.id, clock.id))
    }
    if (!noticed && clock.status === 'met') {
      await tx.update(clocks).set({ status: 'running', metOn: null }).where(eq(clocks.id, clock.id))
    }
  }
  return status
}
