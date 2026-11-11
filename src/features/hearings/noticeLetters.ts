import { eq } from 'drizzle-orm'
import { PDFDocument } from 'pdf-lib'
import type { Db } from '@/db/client'
import { boardMeetings, hearings } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardMergeValues, getBoard } from '@/features/boards/townBoards'
import { formatMinuteOfDay, HEARING_KIND_LABELS } from '@/features/hearings/labels'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { documentFrame } from '@/features/pdf/documentFrame'
import { loadPermitData, mergeContextOf } from '@/features/permits/permitData'
import { townTemplate } from '@/features/templates/findTemplate'
import { type DocumentInput, renderDocument } from '@/features/templates/templateBlocks'
import { formatCivilDate } from '@/lib/formatDate'
import { err, ok, type Result } from '@/types/result'

const MAIL_CHANNELS = new Set(['verified_mail', 'certified_mail', 'first_class_mail'])

interface NoticeRecipient {
  recipientName: string | null
  recipientAddress: string | null
}

export interface HearingNoticeInput {
  input: DocumentInput
  recipients: NoticeRecipient[]
  pins: string[]
}

export async function hearingNoticeInput(
  db: Db,
  setId: string,
  signal: AbortSignal,
): Promise<HearingNoticeInput | null> {
  const [hearing] = await db
    .select({ hearing: hearings, meeting: boardMeetings })
    .from(hearings)
    .innerJoin(boardMeetings, eq(boardMeetings.id, hearings.meetingId))
    .where(eq(hearings.noticeSetId, setId))
  if (hearing === undefined) return null
  const app = await loadApplicationContext(db, hearing.hearing.applicationId, signal)
  const data = await loadPermitData(db, hearing.hearing.applicationId, signal)
  if (app === null || data === null) return null
  const board = await getBoard(db, hearing.meeting.boardId)
  const status = await noticeStatus(db, setId, signal)
  const values = {
    ...mergeContextOf(data),
    ...(await boardMergeValues(db, board)),
    'meeting.date': formatCivilDate(hearing.meeting.meetingDate),
    'meeting.location': hearing.meeting.location,
    'meeting.time': formatMinuteOfDay(hearing.meeting.startsAtMinute),
    'hearing.kind': HEARING_KIND_LABELS[hearing.hearing.kind],
  }
  return {
    input: {
      frame: await documentFrame(db, { boardId: hearing.meeting.boardId }, signal),
      context: { values },
    },
    recipients: status.items.filter((i) => MAIL_CHANNELS.has(i.channel)),
    pins: app.pins.templates,
  }
}

export function recipientInput(base: DocumentInput, recipient: NoticeRecipient): DocumentInput {
  return {
    ...base,
    context: {
      ...base.context,
      values: {
        ...base.context.values,
        'notice.recipientName': recipient.recipientName ?? '',
        'notice.recipientAddress': recipient.recipientAddress ?? '',
      },
    },
  }
}

export async function renderNoticeLetters(
  db: Db,
  actor: Actor,
  setId: string,
  signal: AbortSignal,
): Promise<Result<Uint8Array, 'forbidden' | 'no_template' | 'not_found'>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  const loaded = await hearingNoticeInput(db, setId, signal)
  if (loaded === null) return err('not_found')
  const template = await townTemplate(db, 'hearing_notice', loaded.pins, signal)
  if (template === null) return err('no_template')
  const out = await PDFDocument.create()
  for (const recipient of loaded.recipients) {
    const pdf = await renderDocument(
      'hearing_notice',
      template,
      recipientInput(loaded.input, recipient),
    )
    if (!pdf.ok) return err('no_template')
    const loadedPdf = await PDFDocument.load(pdf.value)
    for (const page of await out.copyPages(loadedPdf, loadedPdf.getPageIndices())) {
      out.addPage(page)
    }
  }
  return ok(await out.save())
}
