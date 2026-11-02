import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  boardDecisions,
  clocks,
  noticeItems,
  noticeSets,
  regionalImpactDeterminations,
  regionalImpactParties,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { getRegionalContacts } from '@/features/boards/regionalContacts'
import { markClockMet } from '@/features/clocks/startClocks'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const TRANSMITTAL_CLOCK_KEY = 'nh.ri.transmittal'
export const TRANSMITTAL_SUBJECT = 'regional_transmittal'

export type TransmittalError =
  | 'forbidden'
  | 'not_found'
  | 'not_regional'
  | 'contacts_missing'
  | 'no_clock'

export async function recordRegionalTransmittal(
  db: Db,
  actor: Actor,
  decisionId: string,
  signal: AbortSignal,
  _now: Date = new Date(),
): Promise<Result<{ setId: string; items: number; met: boolean }, TransmittalError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  return await transactionResult<{ setId: string; items: number; met: boolean }, TransmittalError>(
    db,
    async (tx) => {
      const [decision] = await tx
        .select()
        .from(boardDecisions)
        .where(eq(boardDecisions.id, decisionId))
        .for('update')
      if (decision === undefined) return err('not_found')
      const [regional] = await tx
        .select({ determination: regionalImpactDeterminations.determination })
        .from(regionalImpactDeterminations)
        .where(eq(regionalImpactDeterminations.applicationId, decision.applicationId))
      if (regional?.determination !== 'yes') return err('not_regional')
      const [clock] = await tx
        .select()
        .from(clocks)
        .where(
          and(
            eq(clocks.applicationId, decision.applicationId),
            eq(clocks.ruleKey, TRANSMITTAL_CLOCK_KEY),
          ),
        )
        .orderBy(desc(clocks.createdAt))
        .limit(1)
      if (clock === undefined) return err('no_clock')
      let [set] = await tx
        .select()
        .from(noticeSets)
        .where(
          and(
            eq(noticeSets.subjectKind, TRANSMITTAL_SUBJECT),
            eq(noticeSets.subjectId, decisionId),
          ),
        )
      if (set === undefined) {
        const contacts = await getRegionalContacts(tx, signal)
        const parties = new Set(
          (
            await tx
              .select({ key: regionalImpactParties.municipalityKey })
              .from(regionalImpactParties)
              .where(eq(regionalImpactParties.applicationId, decision.applicationId))
          ).map((p) => p.key),
        )
        const recipients = [
          ...(contacts.commission === null
            ? []
            : [
                { key: 'commission', ...contacts.commission, role: 'regional_planning_commission' },
              ]),
          ...contacts.municipalities
            .filter((m) => parties.has(m.key))
            .map((m) => ({ ...m, role: 'affected_municipality' })),
        ]
        if (recipients.length === 0) return err('contacts_missing')
        const [created] = await tx
          .insert(noticeSets)
          .values({
            subjectKind: TRANSMITTAL_SUBJECT,
            subjectId: decisionId,
            applicationId: decision.applicationId,
            anchorDate: decision.votedOn,
          })
          .returning()
        set = created
        await tx.insert(noticeItems).values(
          recipients.map((r) => ({
            setId: created?.id ?? '',
            requirementKey: TRANSMITTAL_CLOCK_KEY,
            requirementVersion: clock.ruleVersion,
            source: 'pack_rule' as const,
            channel: 'first_class_mail',
            recipientKey: r.key,
            recipientName: r.name,
            recipientAddress: r.mailingAddress,
            roles: [r.role],
            dueOn: clock.currentDue,
            countingMethod: clock.countingMethod,
          })),
        )
      }
      const setId = set?.id ?? ''
      const status = await noticeStatus(tx, setId, signal)
      if (status.properlyNoticed && clock.status !== 'met') {
        const last = status.items
          .flatMap((i) => (i.proof === null ? [] : [i.proof.effectiveOn]))
          .sort((x, y) => compareCivil(x, y))
          .at(-1)
        await markClockMet(
          tx,
          decision.applicationId,
          TRANSMITTAL_CLOCK_KEY,
          last ?? (clock.currentDue as CivilDate),
          signal,
        )
      }
      return ok({ setId, items: status.items.length, met: status.properlyNoticed })
    },
  )
}
