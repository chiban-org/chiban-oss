import { and, asc, eq, gte, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { PDFDocument } from 'pdf-lib'
import type { DbOrTx } from '@/db/client'
import { applications, boardMeetings, boards, hearings } from '@/db/schema'
import { HEARING_KIND_LABELS } from '@/features/hearings/labels'
import { hearingNoticeInput, recipientInput } from '@/features/hearings/noticeLetters'
import { UPCOMING_LIMIT } from '@/features/hearings/publicMeetings'
import type { PdfBlock } from '@/features/pdf/pdfSpec'
import { renderPdf } from '@/features/pdf/renderPdf'
import { townTemplate } from '@/features/templates/findTemplate'
import { templateBlocks, withFrameFields } from '@/features/templates/templateBlocks'
import type { CivilDate } from '@/types/civilDate'

export const PUBLIC_NOTICE_RECIPIENT = 'All interested persons'
export const PUBLIC_NOTICE_ADDRESS = 'Posted on the Town website and bulletin boards'

export interface PublicHearingNotice {
  hearingId: string
  boardShortName: string
  meetingDate: CivilDate
  startsAtMinute: number
  location: string
  kindLabel: string
  applicationNumber: string
  applicantName: string
  parcelAddress: string
  continuedFromDate: CivilDate | null
  withdrawn: boolean
  paragraphs: string[]
}

interface NoticeRow {
  hearingId: string
  noticeSetId: string
  kind: keyof typeof HEARING_KIND_LABELS
  applicationNumber: string
  applicationState: string
  boardShortName: string
  meetingDate: string
  startsAtMinute: number
  location: string
  continuedFromDate: string | null
}

function blockText(block: PdfBlock): string {
  if (block.kind === 'paragraph' || block.kind === 'notice' || block.kind === 'heading') {
    return block.text
  }
  if (block.kind === 'text') return block.runs.map((r) => r.text).join('')
  return ''
}

async function loadRows(
  db: DbOrTx,
  where: ReturnType<typeof and>,
  limit: number,
): Promise<NoticeRow[]> {
  const prior = alias(hearings, 'prior_hearing')
  const priorMeeting = alias(boardMeetings, 'prior_meeting')
  return await db
    .select({
      hearingId: hearings.id,
      noticeSetId: hearings.noticeSetId,
      kind: hearings.kind,
      applicationNumber: applications.number,
      applicationState: applications.state,
      boardShortName: boards.shortName,
      meetingDate: boardMeetings.meetingDate,
      startsAtMinute: boardMeetings.startsAtMinute,
      location: boardMeetings.location,
      continuedFromDate: priorMeeting.meetingDate,
    })
    .from(hearings)
    .innerJoin(boardMeetings, eq(boardMeetings.id, hearings.meetingId))
    .innerJoin(boards, eq(boards.id, boardMeetings.boardId))
    .innerJoin(applications, eq(applications.id, hearings.applicationId))
    .leftJoin(prior, eq(prior.id, hearings.continuedFrom))
    .leftJoin(priorMeeting, eq(priorMeeting.id, prior.meetingId))
    .where(where)
    .orderBy(asc(boardMeetings.meetingDate), asc(boardMeetings.startsAtMinute), asc(hearings.id))
    .limit(limit)
}

function onTheBoard(today: CivilDate) {
  return and(
    eq(hearings.status, 'scheduled'),
    ne(boardMeetings.status, 'cancelled'),
    gte(boardMeetings.meetingDate, today),
  )
}

async function noticeBody(db: DbOrTx, row: NoticeRow, signal: AbortSignal) {
  const loaded = await hearingNoticeInput(db, row.noticeSetId, signal)
  if (loaded === null) return null
  const input = recipientInput(loaded.input, {
    recipientName: PUBLIC_NOTICE_RECIPIENT,
    recipientAddress: PUBLIC_NOTICE_ADDRESS,
  })
  const template = await townTemplate(db, 'hearing_notice', loaded.pins, signal)
  const context = withFrameFields(input)
  const blocks = templateBlocks('hearing_notice', template, context)
  return {
    input,
    values: context.values as Record<string, string>,
    blocks: blocks.ok ? blocks.value : [],
  }
}

function letterHeader(values: Record<string, string>): Set<string> {
  return new Set([PUBLIC_NOTICE_RECIPIENT, PUBLIC_NOTICE_ADDRESS, valueOf(values, 'town.name')])
}

function valueOf(values: Record<string, string>, key: string): string {
  return new Map(Object.entries(values)).get(key) ?? ''
}

async function toNotice(
  db: DbOrTx,
  row: NoticeRow,
  signal: AbortSignal,
): Promise<PublicHearingNotice> {
  const base = {
    hearingId: row.hearingId,
    boardShortName: row.boardShortName,
    meetingDate: row.meetingDate as CivilDate,
    startsAtMinute: row.startsAtMinute,
    location: row.location,
    kindLabel: HEARING_KIND_LABELS[row.kind],
    applicationNumber: row.applicationNumber,
    continuedFromDate: row.continuedFromDate as CivilDate | null,
  }
  if (row.applicationState === 'withdrawn') {
    return { ...base, applicantName: '', parcelAddress: '', withdrawn: true, paragraphs: [] }
  }
  const body = await noticeBody(db, row, signal)
  const values = body?.values ?? {}
  return {
    ...base,
    applicantName: valueOf(values, 'party.applicant.name'),
    parcelAddress: valueOf(values, 'parcel.siteAddress'),
    withdrawn: false,
    paragraphs: (body?.blocks ?? [])
      .map(blockText)
      .filter((t) => t.trim() !== '' && !letterHeader(values).has(t.trim())),
  }
}

export async function loadPublicHearingNotices(
  db: DbOrTx,
  today: CivilDate,
  signal: AbortSignal,
): Promise<PublicHearingNotice[]> {
  signal.throwIfAborted()
  const rows = await loadRows(db, onTheBoard(today), UPCOMING_LIMIT)
  const notices: PublicHearingNotice[] = []
  for (const row of rows) notices.push(await toNotice(db, row, signal))
  return notices
}

export async function renderPublicNoticePdf(
  db: DbOrTx,
  hearingId: string,
  today: CivilDate,
  signal: AbortSignal,
): Promise<Uint8Array | null> {
  signal.throwIfAborted()
  const [row] = await loadRows(db, and(onTheBoard(today), eq(hearings.id, hearingId)), 1)
  if (row === undefined || row.applicationState === 'withdrawn') return null
  const body = await noticeBody(db, row, signal)
  if (body === null) return null
  const spec = {
    title: `Notice of ${HEARING_KIND_LABELS[row.kind]}`,
    frame: body.input.frame,
    blocks: body.blocks,
  }
  const placard = await renderPdf({ ...spec, scale: 'placard' })
  if ((await pageCount(placard)) === 1) return placard
  return await renderPdf({ ...spec, scale: 'document' })
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount()
}
