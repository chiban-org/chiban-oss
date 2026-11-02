import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardDecisions, boardMeetings, clocks, hearings } from '@/db/schema'
import { canViewApplication } from '@/features/access/queries'
import type { Actor } from '@/features/auth/actor'
import { OUTCOME_LABELS } from '@/features/decisions/labels'
import { formatMinuteOfDay, HEARING_KIND_LABELS } from '@/features/hearings/labels'
import { BOARD_NAMES, HEARING_STATUS_LABELS } from '@/features/hearings/views'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { formatCivilDate } from '@/lib/formatDate'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

export interface PortalBoardRecord {
  hearings: string[]
  decisions: string[]
  deadlines: string[]
}

const APPEAL_PREFIX = 'nh.appeal.'
const EXERCISE_KEY = 'nh.zba.exercise'

const CONFIRMED = ' The board confirmed it was properly noticed.'

function noticeText(status: string, noticed: boolean): string {
  if (status === 'held') return CONFIRMED
  if (status !== 'scheduled') return ''
  return noticed ? CONFIRMED : ' Notice to abutters and the public is being sent.'
}

export async function loadPortalBoardRecord(
  db: Db,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<Result<PortalBoardRecord, 'not_found'>> {
  signal.throwIfAborted()
  if (!isUuid(applicationId)) return err('not_found')
  if (!(await canViewApplication(db, actor, applicationId, signal))) return err('not_found')
  const held = await db
    .select({ hearing: hearings, meeting: boardMeetings })
    .from(hearings)
    .innerJoin(boardMeetings, eq(boardMeetings.id, hearings.meetingId))
    .where(eq(hearings.applicationId, applicationId))
    .orderBy(asc(boardMeetings.meetingDate))
  const decisions = await db
    .select()
    .from(boardDecisions)
    .where(eq(boardDecisions.applicationId, applicationId))
    .orderBy(asc(boardDecisions.votedOn))
  const running = await db
    .select()
    .from(clocks)
    .where(
      and(eq(clocks.applicationId, applicationId), inArray(clocks.status, ['running', 'overdue'])),
    )
    .orderBy(asc(clocks.currentDue))
  const pack = loadPack()
  const deadlines = running
    .filter((c) => c.ruleKey.startsWith(APPEAL_PREFIX) || c.ruleKey === EXERCISE_KEY)
    .flatMap((c) => {
      const rule = ruleByKey(pack, c.ruleKey, c.ruleVersion)
      return rule.kind === 'clock' ? [`${rule.label}, due ${formatCivilDate(c.currentDue)}.`] : []
    })
  return ok({
    hearings: held.map(({ hearing, meeting }) => {
      const where = meeting.location === '' ? '' : `, ${meeting.location}`
      return `${HEARING_KIND_LABELS[hearing.kind]}, ${BOARD_NAMES[meeting.board]}, ${formatCivilDate(meeting.meetingDate)} at ${formatMinuteOfDay(meeting.startsAtMinute)}${where}. ${HEARING_STATUS_LABELS[hearing.status]}.${noticeText(hearing.status, hearing.properlyNoticedAt !== null)}`
    }),
    decisions: decisions.map(
      (d) =>
        `${OUTCOME_LABELS[d.outcome]}, voted ${formatCivilDate(d.votedOn)}.${d.filedOn === null ? '' : ` Filed ${formatCivilDate(d.filedOn)}.`}`,
    ),
    deadlines,
  })
}
