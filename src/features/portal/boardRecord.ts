import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardDecisions, boardMeetings, boards, clocks, hearings } from '@/db/schema'
import { canViewApplication } from '@/features/access/queries'
import type { Actor } from '@/features/auth/actor'
import { OUTCOME_LABELS } from '@/features/decisions/labels'
import { formatMinuteOfDay, HEARING_KIND_LABELS } from '@/features/hearings/labels'
import { HEARING_STATUS_LABELS } from '@/features/hearings/views'
import { type NoticeStatusItem, noticeStatus } from '@/features/notices/noticeStatus'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { packRoles } from '@/features/packs/roles'
import { inRuleGroup } from '@/features/packs/ruleGroups'
import { pendingWindowLines } from '@/features/portal/pendingWindows'
import { formatCivilDate } from '@/lib/formatDate'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

export interface PortalBoardRecord {
  hearings: string[]
  decisions: string[]
  deadlines: string[]
  notice: string[]
}

const MAIL_CHANNELS: readonly string[] = ['verified_mail', 'certified_mail', 'first_class_mail']
const POSTING_CHANNELS: readonly string[] = ['public_posting', 'bulletin_board']

function latestProof(items: readonly NoticeStatusItem[]): string | null {
  const dates = items.flatMap((i) => (i.proof === null ? [] : [i.proof.effectiveOn]))
  return dates.sort().at(-1) ?? null
}

function noticeLines(items: readonly NoticeStatusItem[]): string[] {
  const mailed = items.filter((i) => MAIL_CHANNELS.includes(i.channel) && i.proof !== null)
  const postedOn = latestProof(items.filter((i) => POSTING_CHANNELS.includes(i.channel)))
  const newspaper = items.filter((i) => i.channel === 'newspaper')
  const publishedOn = latestProof(newspaper)
  const owners = mailed.length === 1 ? 'owner' : 'owners'
  const mailedOn = latestProof(mailed)
  return [
    ...(mailedOn === null
      ? []
      : [`${mailed.length} ${owners} mailed on ${formatCivilDate(mailedOn)}.`]),
    ...(postedOn === null ? [] : [`Posted on ${formatCivilDate(postedOn)}.`]),
    ...(newspaper.length === 0
      ? []
      : [
          publishedOn === null
            ? 'Newspaper notice: Not published.'
            : `Published in the newspaper on ${formatCivilDate(publishedOn)}.`,
        ]),
  ]
}

async function latestNotice(
  db: Db,
  held: readonly { hearing: { noticeSetId: string } }[],
  signal: AbortSignal,
): Promise<string[]> {
  const last = held.at(-1)
  if (last === undefined) return []
  return noticeLines((await noticeStatus(db, last.hearing.noticeSetId, signal)).items)
}

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
    .select({ hearing: hearings, meeting: boardMeetings, boardShortName: boards.shortName })
    .from(hearings)
    .innerJoin(boardMeetings, eq(boardMeetings.id, hearings.meetingId))
    .innerJoin(boards, eq(boards.id, boardMeetings.boardId))
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
  const shown = packRoles().ruleGroups.portalBoardDeadlines
  const deadlines = running
    .filter((c) => inRuleGroup(c.ruleKey, shown))
    .flatMap((c) => {
      const rule = ruleByKey(pack, c.ruleKey, c.ruleVersion)
      return rule.kind === 'clock' ? [`${rule.label}, due ${formatCivilDate(c.currentDue)}.`] : []
    })
  const pending = await pendingWindowLines(db, decisions.at(-1), signal)
  return ok({
    hearings: held.map(({ hearing, meeting, boardShortName }) => {
      const where = meeting.location === '' ? '' : `, ${meeting.location}`
      return `${HEARING_KIND_LABELS[hearing.kind]}, ${boardShortName}, ${formatCivilDate(meeting.meetingDate)} at ${formatMinuteOfDay(meeting.startsAtMinute)}${where}. ${HEARING_STATUS_LABELS[hearing.status]}.${noticeText(hearing.status, hearing.properlyNoticedAt !== null)}`
    }),
    decisions: decisions.map(
      (d) =>
        `${OUTCOME_LABELS[d.outcome]}, voted ${formatCivilDate(d.votedOn)}.${d.filedOn === null ? '' : ` Filed ${formatCivilDate(d.filedOn)}.`}`,
    ),
    deadlines: [...deadlines, ...pending],
    notice: await latestNotice(db, held, signal),
  })
}
