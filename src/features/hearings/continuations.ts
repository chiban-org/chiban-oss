import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { hearings, noticeSets } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { getMeeting } from '@/features/boards/meetings'
import { deriveNoticeItems } from '@/features/notices/deriveItems'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type ContinueError =
  | 'forbidden'
  | 'not_found'
  | 'details_required'
  | 'wrong_board'
  | 'meeting_cancelled'
  | 'not_continuable'
  | 'no_issued_list'
  | 'determination_missing'

export async function continueHearing(
  db: Db,
  actor: Actor,
  input: {
    hearingId: string
    toMeetingId: string
    announcedAtMeeting: boolean
    announcedDetails?: string
  },
  signal: AbortSignal,
): Promise<Result<{ hearingId: string }, ContinueError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  const details = input.announcedDetails?.trim() ?? ''
  if (input.announcedAtMeeting && details === '') return err('details_required')
  return await transactionResult<{ hearingId: string }, ContinueError>(db, async (tx) => {
    const [prior] = await tx
      .select()
      .from(hearings)
      .where(eq(hearings.id, input.hearingId))
      .for('update')
    if (prior === undefined) return err('not_found')
    if (prior.status !== 'scheduled') return err('not_continuable')
    const app = await loadApplicationContext(tx, prior.applicationId, signal)
    if (app === null) return err('not_found')
    const meeting = await getMeeting(tx, input.toMeetingId, signal)
    if (meeting === null) return err('not_found')
    if (meeting.board !== boardOfApplication(app)) return err('wrong_board')
    if (meeting.status === 'cancelled') return err('meeting_cancelled')
    const hearingId = randomUUID()
    let noticeSetId: string
    if (input.announcedAtMeeting) {
      const [set] = await tx
        .insert(noticeSets)
        .values({
          subjectKind: 'hearing',
          subjectId: hearingId,
          applicationId: app.id,
          anchorDate: meeting.meetingDate,
          inheritedFrom: prior.noticeSetId,
        })
        .returning({ id: noticeSets.id })
      noticeSetId = set?.id ?? ''
    } else {
      const derived = await deriveNoticeItems(
        tx,
        {
          subjectKind: 'hearing',
          subjectId: hearingId,
          applicationId: app.id,
          anchorDate: meeting.meetingDate as CivilDate,
        },
        signal,
      )
      if (!derived.ok) {
        return err(derived.error)
      }
      noticeSetId = derived.value.setId
    }
    await tx.update(hearings).set({ status: 'continued' }).where(eq(hearings.id, prior.id))
    await tx.insert(hearings).values({
      id: hearingId,
      applicationId: app.id,
      meetingId: meeting.id,
      kind: prior.kind,
      continuedFrom: prior.id,
      continuationAnnounced: input.announcedAtMeeting,
      announcedDetails: input.announcedAtMeeting ? details : null,
      noticeSetId,
      properlyNoticedAt: input.announcedAtMeeting ? prior.properlyNoticedAt : null,
      properlyNoticedBy: input.announcedAtMeeting ? prior.properlyNoticedBy : null,
      createdBy: actor.userId,
    })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'hearing.continue',
        entityType: 'application',
        entityId: app.id,
        after: {
          from: prior.id,
          to: hearingId,
          announced: input.announcedAtMeeting,
          meetingId: meeting.id,
        },
      },
      signal,
    )
    return ok({ hearingId })
  })
}
