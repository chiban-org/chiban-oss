import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { applications, clocks, inspections } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { startClocksFor } from '@/features/clocks/startClocks'
import { getPublished } from '@/features/config/store'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import { recordInspectionResult } from '@/features/inspections/recordResult'
import { makeApplication } from '@/test/applicationFixtures'
import { type BoardWorld, boardIdSql, submitBoardApplication } from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import {
  INSPECTION_NOW,
  type InspectionWorld,
  passingItems,
  RESULT_NOW,
  scheduledInspection,
} from '@/test/inspectionFixtures'
import { issueListWithRecipients, proveEverything, recipient } from '@/test/noticeFixtures'
import { XX_COMMENCEMENT_KEY } from '@/test/packs/xx/triggerVariants'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate

export const COMMENCEMENT_TYPE = 'BPC'
export const TRIGGER_MEETING = '2027-04-15'

export async function clockRows(db: Db, applicationId: string) {
  return await db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
}

export async function publishCommencementType(db: Db, w: InspectionWorld): Promise<void> {
  const electrical = await getPublished(db, 'application_type', 'EL', signal)
  const body = electrical?.body as ApplicationTypeBody
  await saveAndPublish(db, w.world.admin, 'application_type', COMMENCEMENT_TYPE, {
    ...body,
    key: COMMENCEMENT_TYPE,
    label: 'Commencement permit',
    prefix: 'BC',
    classification: 'xx.building_permit',
    bindings: ['xx.bp.decision', XX_COMMENCEMENT_KEY],
    workflow: { ...body.workflow, allowsDirectIssue: false },
  })
}

export async function issuedCommencementPermit(
  db: Db,
  w: InspectionWorld,
  issuedOn: CivilDate,
): Promise<string> {
  const made = await makeApplication(
    db,
    w.world,
    { state: 'issued', issuedOn },
    INSPECTION_NOW,
    COMMENCEMENT_TYPE,
  )
  await db.transaction((tx) =>
    startClocksFor(tx, made.applicationId, 'permit_issued', issuedOn, signal),
  )
  return made.applicationId
}

export async function recordRoughInspection(
  db: Db,
  w: InspectionWorld,
  applicationId: string,
  result: 'passed' | 'failed' = 'passed',
): Promise<void> {
  const id = await scheduledInspection(db, w.inspector, applicationId, 'rough')
  const [row] = await db.select().from(inspections).where(eq(inspections.id, id))
  const passing = await passingItems(db, applicationId, 'rough')
  const items =
    result === 'passed'
      ? passing
      : passing.map((item, i) => (i === 0 ? { ...item, outcome: 'fail' as const } : item))
  const recorded = await recordInspectionResult(
    db,
    w.inspector,
    {
      inspectionId: id,
      expectedRowVersion: row?.rowVersion ?? 0,
      result,
      items,
      notes: result === 'failed' ? 'Footing depth short of the drawings.' : undefined,
    },
    signal,
    { now: RESULT_NOW },
  )
  if (!recorded.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, `result failed: ${JSON.stringify(recorded.error)}`)
  }
}

export async function triggerMeetingId(db: Db): Promise<string> {
  const rows = await db.query.boardMeetings.findMany({
    where: (m, { and, eq: same }) =>
      and(same(m.meetingDate, TRIGGER_MEETING), same(m.boardId, boardIdSql('zba'))),
  })
  return rows[0]?.id ?? ''
}

export async function acceptedBoardApplication(
  db: Db,
  world: BoardWorld,
  acceptedOn: CivilDate | null,
): Promise<string> {
  const applicationId = await submitBoardApplication(db, world, world.zbaTypeKey, '2027-03-02')
  await db
    .update(applications)
    .set({ state: 'under_review', completedDate: acceptedOn })
    .where(eq(applications.id, applicationId))
  if (acceptedOn !== null) {
    await db.transaction((tx) =>
      startClocksFor(tx, applicationId, 'application_accepted', acceptedOn, signal),
    )
  }
  return applicationId
}

export async function scheduleTriggerHearing(
  db: Db,
  world: BoardWorld,
  applicationId: string,
): Promise<string> {
  await issueListWithRecipients(db, world, applicationId, [recipient(1), recipient(2)])
  const scheduled = await scheduleHearing(
    db,
    world.staff,
    { applicationId, meetingId: await triggerMeetingId(db), kind: 'public_hearing' },
    signal,
  )
  if (!scheduled.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, `schedule failed: ${JSON.stringify(scheduled.error)}`)
  }
  return scheduled.value.hearingId
}

export async function holdTriggerHearing(
  db: Db,
  world: BoardWorld,
  applicationId: string,
  hearingId: string,
): Promise<void> {
  const [hearing] = await db.query.hearings.findMany({
    where: (h, { eq: same }) => same(h.id, hearingId),
  })
  const now = new Date(`${TRIGGER_MEETING}T16:00:00Z`)
  await proveEverything(db, world, applicationId, hearing?.noticeSetId ?? '', d('2027-03-30'), now)
  await markProperlyNoticed(db, world.staff, hearingId, signal, now)
  const held = await markHearingHeld(
    db,
    world.staff,
    { hearingId, heldOn: d(TRIGGER_MEETING) },
    signal,
    now,
  )
  if (!held.ok) throw new AppError(ErrorIds.DB_INVARIANT, `hold failed: ${held.error}`)
}
