import { eq } from 'drizzle-orm'
import { PDFDocument } from 'pdf-lib'
import type { Db } from '@/db/client'
import { boardMeetings, hearings } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { boardLabel, getBoardSettings } from '@/features/boards/boardSettings'
import { getVersion } from '@/features/config/store'
import { formatMinuteOfDay, HEARING_KIND_LABELS } from '@/features/hearings/labels'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { documentFrame } from '@/features/pdf/documentFrame'
import { renderPdf } from '@/features/pdf/renderPdf'
import { loadPermitData, mergeContextOf } from '@/features/permits/permitData'
import { frameMergeContext } from '@/features/templates/frameFields'
import { renderTemplateText } from '@/features/templates/renderTemplate'
import type { TemplateBody } from '@/features/templates/templateSchema'
import { formatCivilDate } from '@/lib/formatDate'
import { err, ok, type Result } from '@/types/result'

const MAIL_CHANNELS = new Set(['verified_mail', 'certified_mail', 'first_class_mail'])

async function hearingTemplate(
  db: Db,
  templateIds: string[],
  signal: AbortSignal,
): Promise<TemplateBody | null> {
  for (const id of templateIds) {
    const version = await getVersion(db, id, signal)
    const body = version?.body as TemplateBody | undefined
    if (body?.kind === 'hearing_notice') return body
  }
  return null
}

export async function renderNoticeLetters(
  db: Db,
  actor: Actor,
  setId: string,
  signal: AbortSignal,
): Promise<Result<Uint8Array, 'forbidden' | 'no_template' | 'not_found'>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  const [hearing] = await db
    .select({ hearing: hearings, meeting: boardMeetings })
    .from(hearings)
    .innerJoin(boardMeetings, eq(boardMeetings.id, hearings.meetingId))
    .where(eq(hearings.noticeSetId, setId))
  if (hearing === undefined) return err('not_found')
  const app = await loadApplicationContext(db, hearing.hearing.applicationId, signal)
  const data = await loadPermitData(db, hearing.hearing.applicationId, signal)
  if (app === null || data === null) return err('not_found')
  const template = await hearingTemplate(db, app.pins.templates, signal)
  if (template === null) return err('no_template')
  const board = boardOfApplication(app)
  const settings = await getBoardSettings(db, signal)
  const status = await noticeStatus(db, setId, signal)
  const frame = await documentFrame(db, { board }, signal)
  const base = {
    ...mergeContextOf(data),
    ...frameMergeContext(frame),
    'board.name': board === null ? '' : boardLabel(settings, board),
    'meeting.date': formatCivilDate(hearing.meeting.meetingDate),
    'meeting.location': hearing.meeting.location,
    'meeting.time': formatMinuteOfDay(hearing.meeting.startsAtMinute),
    'hearing.kind': HEARING_KIND_LABELS[hearing.hearing.kind],
  }
  const out = await PDFDocument.create()
  for (const item of status.items.filter((i) => MAIL_CHANNELS.has(i.channel))) {
    const text = renderTemplateText(template.body, {
      ...base,
      'notice.recipientName': item.recipientName ?? '',
      'notice.recipientAddress': item.recipientAddress ?? '',
    })
    if (!text.ok) return err('no_template')
    const pdf = await renderPdf({
      title: template.label,
      frame,
      scale: 'document',
      blocks: text.value
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p !== '')
        .map((paragraph) => ({ kind: 'paragraph' as const, text: paragraph })),
    })
    const loaded = await PDFDocument.load(pdf)
    for (const page of await out.copyPages(loaded, loaded.getPageIndices())) out.addPage(page)
  }
  return ok(await out.save())
}
