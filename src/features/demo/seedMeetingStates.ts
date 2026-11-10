import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { agendas, boardPacketLinks, hearings } from '@/db/schema'
import { issueList } from '@/features/abutters/issue'
import { generateList } from '@/features/abutters/lists'
import { currentIssuedList } from '@/features/abutters/queries'
import { addAgendaItem, buildAgenda, publishAgenda } from '@/features/agendas/agendas'
import { createMeetingPacket, meetingPacketId } from '@/features/agendas/meetingPacket'
import { recordDesDetermination } from '@/features/boards/des500'
import { sendPacketLink } from '@/features/boards/packetLinks'
import { recordBoardRegionalImpact } from '@/features/boards/regionalImpact'
import { DEMO_DOMAIN } from '@/features/demo/domain'
import { COMMON } from '@/features/demo/seedBoardApps'
import { storyDay } from '@/features/demo/seedCalendar'
import type { CoverageContext } from '@/features/demo/seedCoverage'
import { meetingId as meetingOn } from '@/features/demo/seedHearings'
import { removeStaleDemoPacket, seedCancelledMeeting } from '@/features/demo/seedMeetingCleanup'
import { packetWithUnsentChange, sentPacketWithReads } from '@/features/demo/seedPacketStates'
import { findApplication, must, open } from '@/features/demo/seedPermitSupport'
import { scheduleHearing } from '@/features/hearings/hearings'

interface HearingApp {
  title: string
  typeKey: 'SPR' | 'MSP'
  parcel: string
  submittedOn: string
  values: Record<string, unknown>
}

const SITE_PLAN = { ...COMMON, gross_floor_area_sq_ft: 6400, parking_spaces: 22 }
const MINOR_SITE_PLAN = { ...COMMON, gross_floor_area_sq_ft: 3100 }

const awaitingAgenda = (): readonly HearingApp[] => [
  {
    title: 'Kingfisher Point site plan',
    typeKey: 'SPR',
    parcel: '009001000000',
    submittedOn: storyDay('2026-10-16'),
    values: SITE_PLAN,
  },
  {
    title: 'Merganser Court minor site plan',
    typeKey: 'MSP',
    parcel: '009016000000',
    submittedOn: storyDay('2026-10-19'),
    values: MINOR_SITE_PLAN,
  },
]

const draftAgendaApp = (): HearingApp => ({
  title: 'Teal Marsh minor site plan',
  typeKey: 'MSP',
  parcel: '009017000000',
  submittedOn: storyDay('2026-10-23'),
  values: MINOR_SITE_PLAN,
})

const publishedAgendaApp = (): HearingApp => ({
  title: 'Loon Cove site plan',
  typeKey: 'SPR',
  parcel: '009017000000',
  submittedOn: storyDay('2026-10-27'),
  values: SITE_PLAN,
})

async function agendaStatus(db: Db, meetingId: string): Promise<string | null> {
  const [row] = await db
    .select({ status: agendas.status })
    .from(agendas)
    .where(eq(agendas.meetingId, meetingId))
  return row?.status ?? null
}

async function hearingApplication(ctx: CoverageContext, app: HearingApp): Promise<string> {
  const applicationId =
    (await findApplication(ctx.db, app.title)) ??
    (await open(ctx.db, ctx.cast, ctx.signal, app)).applicationId
  if ((await currentIssuedList(ctx.db, applicationId, ctx.signal)) !== null) return applicationId
  const input = { applicationId }
  must(
    await recordBoardRegionalImpact(
      ctx.db,
      ctx.cast.staff,
      { ...input, determination: 'no', municipalityKeys: [] },
      ctx.signal,
      ctx.now,
    ),
    `regional impact ${app.title}`,
  )
  must(
    await recordDesDetermination(
      ctx.db,
      ctx.cast.staff,
      {
        ...input,
        determination: 'not_within',
        reason: 'The surveyed plan shows the work more than 500 feet from the pond.',
      },
      ctx.signal,
      ctx.now,
    ),
    `des determination ${app.title}`,
  )
  const list = must(
    await generateList(ctx.db, ctx.cast.staff, input, ctx.signal, ctx.now),
    `list ${app.title}`,
  )
  must(
    await issueList(ctx.db, ctx.cast.staff, { listId: list.listId }, ctx.signal, ctx.now),
    `issue list ${app.title}`,
  )
  return applicationId
}

async function scheduleOnce(ctx: CoverageContext, app: HearingApp, meetingId: string) {
  const applicationId = await hearingApplication(ctx, app)
  const [held] = await ctx.db
    .select({ id: hearings.id })
    .from(hearings)
    .where(and(eq(hearings.applicationId, applicationId), eq(hearings.meetingId, meetingId)))
  if (held !== undefined) return false
  must(
    await scheduleHearing(
      ctx.db,
      ctx.cast.staff,
      { applicationId, meetingId, kind: 'submission_and_hearing' },
      ctx.signal,
    ),
    `hearing ${app.title}`,
  )
  return true
}

async function hearingsAwaitingAgenda(ctx: CoverageContext): Promise<boolean> {
  const meetingId = await meetingOn(ctx.db, 'planning_board', storyDay('2026-11-12'))
  let added = false
  for (const app of awaitingAgenda()) added = (await scheduleOnce(ctx, app, meetingId)) || added
  return added
}

async function draftAgenda(ctx: CoverageContext): Promise<boolean> {
  const meetingId = await meetingOn(ctx.db, 'planning_board', storyDay('2026-11-25'))
  if ((await agendaStatus(ctx.db, meetingId)) !== null) return false
  await scheduleOnce(ctx, draftAgendaApp(), meetingId)
  must(await buildAgenda(ctx.db, ctx.cast.staff, meetingId, ctx.signal), 'build draft agenda')
  must(
    await addAgendaItem(
      ctx.db,
      ctx.cast.staff,
      { meetingId, kind: 'minutes_approval', title: 'Approve the November 12 minutes' },
      ctx.signal,
    ),
    'minutes item',
  )
  return true
}

async function publishedWithPacket(
  ctx: CoverageContext,
  meetingId: string,
  app: HearingApp | null,
): Promise<boolean> {
  const status = await agendaStatus(ctx.db, meetingId)
  if (status !== 'published' && app !== null) await scheduleOnce(ctx, app, meetingId)
  if (status !== 'published') {
    must(await buildAgenda(ctx.db, ctx.cast.staff, meetingId, ctx.signal), 'build agenda')
    must(
      await publishAgenda(ctx.db, ctx.store, ctx.cast.staff, meetingId, ctx.signal),
      'publish agenda',
    )
  }
  if ((await meetingPacketId(ctx.db, meetingId)) !== null) return status !== 'published'
  must(
    await createMeetingPacket(ctx.db, ctx.store, ctx.cast.staff, meetingId, ctx.signal),
    'meeting packet',
  )
  return true
}

async function openPacketLink(ctx: CoverageContext, meetingId: string): Promise<boolean> {
  const packetId = await meetingPacketId(ctx.db, meetingId)
  if (packetId === null) return false
  const sent = await ctx.db
    .select({ id: boardPacketLinks.id })
    .from(boardPacketLinks)
    .where(eq(boardPacketLinks.packetId, packetId))
  if (sent.length > 0) return false
  must(
    await sendPacketLink(
      ctx.db,
      ctx.mail,
      ctx.cast.staff,
      { packetId, recipientName: 'Jordan Pike', recipientEmail: `counsel@${DEMO_DOMAIN}` },
      ctx.signal,
      ctx.now,
    ),
    'packet link',
  )
  return true
}

export async function seedMeetingStates(ctx: CoverageContext): Promise<boolean> {
  const december9 = await meetingOn(ctx.db, 'planning_board', storyDay('2026-12-09'))
  const december15 = await meetingOn(ctx.db, 'zba', storyDay('2026-12-15'))
  const steps = [
    await removeStaleDemoPacket(ctx),
    await hearingsAwaitingAgenda(ctx),
    await draftAgenda(ctx),
    await publishedWithPacket(ctx, december9, publishedAgendaApp()),
    await publishedWithPacket(ctx, december15, null),
    await sentPacketWithReads(ctx, december9),
    await openPacketLink(ctx, december9),
    await packetWithUnsentChange(ctx, december15),
    await seedCancelledMeeting(ctx),
  ]
  return steps.some(Boolean)
}
