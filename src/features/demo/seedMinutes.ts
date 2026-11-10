import { eq } from 'drizzle-orm'
import { meetingMinutes } from '@/db/schema'
import { recordMinutes } from '@/features/boards/minutes'
import { storyDay } from '@/features/demo/seedCalendar'
import type { CoverageContext } from '@/features/demo/seedCoverage'
import { meetingId as meetingOn } from '@/features/demo/seedHearings'
import { must } from '@/features/demo/seedPermitSupport'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { plainFrame } from '@/features/pdf/frame'
import { renderPdf } from '@/features/pdf/renderPdf'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

export interface DemoMinutes {
  meetingDate: string
  approvedOn: string | null
  body: string
}

const planningBoardMinutes = (): readonly DemoMinutes[] => [
  {
    meetingDate: storyDay('2026-09-23'),
    approvedOn: storyDay('2026-10-14'),
    body: 'Present: five members and the land use clerk. The board reviewed the capital improvements plan and set the October 14 hearing schedule. Adjourned at 8:40 PM.',
  },
  {
    meetingDate: storyDay('2026-10-14'),
    approvedOn: storyDay('2026-10-28'),
    body: 'Present: five members and the land use clerk. The board held the scheduled public hearing, took testimony from abutters, and voted on the application before it. Adjourned at 9:15 PM.',
  },
  {
    meetingDate: storyDay('2026-10-28'),
    approvedOn: null,
    body: 'Present: four members and the land use clerk. The board discussed driveway standards in the subdivision regulations and continued the discussion to November. Adjourned at 8:05 PM.',
  },
]

export type MinutesContext = Pick<CoverageContext, 'db' | 'store' | 'signal' | 'cast' | 'now'>

export async function attachMinutes(
  ctx: MinutesContext,
  meetingId: string,
  entry: DemoMinutes,
  boardName = 'Planning Board',
) {
  const title = `${boardName} minutes, ${formatCivilDate(entry.meetingDate)}`
  const bytes = await renderPdf({
    title,
    frame: plainFrame('Town of Alder Pond'),
    scale: 'document',
    blocks: [{ kind: 'paragraph', text: entry.body }],
  })
  return await ctx.db.transaction(async (tx) => {
    const stored = await storeGeneratedBytes(tx, ctx.store, bytes, 'application/pdf', ctx.signal)
    const attached = await attachDocument(
      tx,
      ctx.cast.staff,
      {
        target: { kind: 'meeting', id: meetingId },
        title,
        docKind: 'attachment',
        file: {
          sha256: stored.sha256,
          filename: `minutes-${entry.meetingDate}.pdf`,
          contentType: 'application/pdf',
        },
      },
      ctx.signal,
    )
    return attached.documentId
  })
}

async function seedOne(ctx: CoverageContext, entry: DemoMinutes): Promise<boolean> {
  const meetingId = await meetingOn(ctx.db, 'planning_board', entry.meetingDate)
  if (meetingId === '' || entry.meetingDate > ctx.today) return false
  const [existing] = await ctx.db
    .select({ id: meetingMinutes.meetingId })
    .from(meetingMinutes)
    .where(eq(meetingMinutes.meetingId, meetingId))
  if (existing !== undefined) return false
  const documentId = await attachMinutes(ctx, meetingId, entry)
  const approved = entry.approvedOn !== null && entry.approvedOn <= ctx.today
  must(
    await recordMinutes(
      ctx.db,
      ctx.cast.staff,
      {
        meetingId,
        documentId,
        status: approved ? 'approved' : 'draft',
        approvedOn: approved ? (entry.approvedOn as CivilDate) : null,
      },
      ctx.signal,
      ctx.now,
    ),
    `minutes ${entry.meetingDate}`,
  )
  return true
}

export async function seedMeetingMinutes(ctx: CoverageContext): Promise<boolean> {
  let added = false
  for (const entry of planningBoardMinutes()) added = (await seedOne(ctx, entry)) || added
  return added
}
