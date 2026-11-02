import { NH_INSPECTION_SETTINGS_DEFAULT } from '@packs/nh/starters'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications, inspections, inspectorCalendars, projects } from '@/db/schema'
import { issueCertificateOfOccupancy } from '@/features/certificates/issueCertificate'
import { publishConfig } from '@/features/config/publish'
import { getPublished, saveDraft } from '@/features/config/store'
import {
  actorFor,
  BUILDING_VALUES,
  type Cast,
  completeAndReview,
  must,
  noon,
  open,
  readyToIssue,
  TITLE_PREFIX,
} from '@/features/demo/seedPermitSupport'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { checklistItems } from '@/features/inspections/checklistItems'
import { getInspectionSettings } from '@/features/inspections/inspectionSettings'
import { cancelOpenInspections } from '@/features/inspections/permitStateEffect'
import { recordInspectionResult } from '@/features/inspections/recordResult'
import { requestInspection } from '@/features/inspections/requestInspection'
import { scheduleInspection } from '@/features/inspections/schedule'
import { schedulingDates } from '@/features/inspections/slots'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { getObjectStore, type ObjectStore } from '@/features/storage/objectStore'
import { getTownSettings } from '@/features/town/settings'
import { addDays, type CivilDate, dayOfWeek, todayInTimeZone } from '@/types/civilDate'

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
)
const FIRST_SLOT = 570
const SECOND_SLOT = 630
const LOOKBACK_DAYS = 21
const BOOKING_LEAD_DAYS = 3

export interface SeedInspectionsDeps {
  now?: Date
  store?: ObjectStore
}

interface Days {
  seeded: CivilDate
  recent: CivilDate
  earlier: CivilDate
}

async function inspectionDays(db: Db, today: CivilDate, signal: AbortSignal): Promise<Days> {
  const settings = await getInspectionSettings(db, signal)
  const holidays = packHolidayCalendar()
  const isDay = (date: CivilDate) =>
    (settings.schedulingDays as number[]).includes(dayOfWeek(date)) && !holidays.isHoliday(date)
  let seeded = today
  while (!isDay(seeded)) seeded = addDays(seeded, 1)
  const past: CivilDate[] = []
  for (let back = 1; back <= LOOKBACK_DAYS && past.length < 2; back += 1) {
    const candidate = addDays(today, -back)
    if (isDay(candidate)) past.push(candidate)
  }
  return { seeded, recent: past[0] ?? today, earlier: past[1] ?? today }
}

async function publishSettings(db: Db, cast: Cast, signal: AbortSignal): Promise<void> {
  if ((await getPublished(db, 'inspection_settings', 'default', signal)) !== null) return
  const saved = must(
    await saveDraft(
      db,
      cast.admin,
      { kind: 'inspection_settings', key: 'default', body: NH_INSPECTION_SETTINGS_DEFAULT },
      signal,
    ),
    'inspection settings draft',
  )
  must(await publishConfig(db, cast.admin, saved.versionId, signal), 'inspection settings')
}

async function applicationByTitle(db: Db, title: string): Promise<string> {
  const [row] = await db
    .select({ id: applications.id })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(eq(projects.title, `${TITLE_PREFIX} ${title}`))
  return must(row === undefined ? { ok: false, error: title } : { ok: true, value: row.id }, title)
}

export async function seedInspections(
  db: Db,
  signal: AbortSignal,
  deps: SeedInspectionsDeps = {},
): Promise<boolean> {
  signal.throwIfAborted()
  if ((await db.select({ id: inspections.id }).from(inspections).limit(1)).length > 0) return false
  const clock = deps.now ?? new Date()
  const town = await getTownSettings(db, signal)
  const today = todayInTimeZone(town.ok ? town.value.timeZone : 'America/New_York', clock)
  const cast: Cast = {
    admin: await actorFor(db, 'admin', signal),
    staff: await actorFor(db, 'staff', signal),
    applicant: await actorFor(db, 'applicant', signal),
  }
  const inspector = await actorFor(db, 'inspector', signal)
  await publishSettings(db, cast, signal)
  await db.insert(inspectorCalendars).values({
    userId: inspector.userId,
    kind: 'ics_email',
    email: 'inspector@alderpond.example',
    updatedBy: cast.admin.userId,
  })
  const days = await inspectionDays(db, today, signal)
  const typeId = (applicationId: string, type: string) =>
    checklistItems(db, applicationId, type, signal)

  const run = async (
    applicationId: string,
    type: string,
    plan: {
      day: CivilDate
      slot: number
      outcome?: { result: 'passed' | 'failed'; notes?: string; failItem?: string }
      reinspectionOf?: string
      channel?: 'phone' | 'portal'
    },
  ) => {
    const info = await typeId(applicationId, type)
    const bookedAt = noon(addDays(plan.day, -BOOKING_LEAD_DAYS))
    const made = must(
      await requestInspection(
        db,
        plan.channel === 'portal' ? cast.applicant : cast.staff,
        {
          applicationId,
          checklistVersionId: info.checklistVersionId,
          channel: plan.channel ?? 'phone',
          contactName: 'Pat Contractor',
          contactPhone: '603-555-0142',
          accessNotes: 'Gate code 4411. Dog in the yard.',
          ...(plan.reinspectionOf === undefined ? {} : { reinspectionOf: plan.reinspectionOf }),
        },
        signal,
        { now: bookedAt },
      ),
      `request ${type}`,
    )
    if (plan.channel === 'portal') return made.inspectionId
    const [row] = await db.select().from(inspections).where(eq(inspections.id, made.inspectionId))
    must(
      await scheduleInspection(
        db,
        cast.staff,
        {
          inspectionId: made.inspectionId,
          inspectorUserId: inspector.userId,
          date: plan.day,
          startMinute: plan.slot,
          expectedRowVersion: row?.rowVersion ?? 1,
        },
        signal,
        { now: bookedAt },
      ),
      `schedule ${type}`,
    )
    if (plan.outcome === undefined) return made.inspectionId
    const [booked] = await db
      .select()
      .from(inspections)
      .where(eq(inspections.id, made.inspectionId))
    const items = info.items.map((item) => ({
      itemKey: item.key,
      outcome: item.key === plan.outcome?.failItem ? ('fail' as const) : ('pass' as const),
    }))
    must(
      await recordInspectionResult(
        db,
        inspector,
        {
          inspectionId: made.inspectionId,
          result: plan.outcome.result,
          ...(plan.outcome.notes === undefined ? {} : { notes: plan.outcome.notes }),
          items,
          expectedRowVersion: booked?.rowVersion ?? 1,
        },
        signal,
        { now: new Date(`${plan.day}T21:00:00Z`) },
      ),
      `result ${type}`,
    )
    return made.inspectionId
  }

  const service = await applicationByTitle(db, 'Service upgrade')
  await run(service, 'rough', {
    day: days.earlier,
    slot: FIRST_SLOT,
    outcome: { result: 'passed' },
  })
  await run(service, 'final', { day: days.seeded, slot: FIRST_SLOT })

  const deck = await applicationByTitle(db, 'Deck renewed once')
  const failedFraming = await run(deck, 'framing', {
    day: days.recent,
    slot: FIRST_SLOT,
    outcome: {
      result: 'failed',
      notes:
        'Fire blocking is missing at the stair opening. Add blocking and call for a reinspection.',
      failItem: 'framing-2',
    },
  })
  await attachPhoto(db, store(deps), inspector, failedFraming, signal)
  await run(deck, 'framing', {
    day: days.seeded,
    slot: SECOND_SLOT,
    reinspectionOf: failedFraming,
  })
  const insulation = await typeId(deck, 'insulation')
  must(
    await requestInspection(
      db,
      cast.applicant,
      {
        applicationId: deck,
        checklistVersionId: insulation.checklistVersionId,
        channel: 'portal',
        contactName: 'Alex Applicant',
        contactPhone: '603-555-0177',
        preferredDate: schedulingDates(
          await getInspectionSettings(db, signal),
          packHolidayCalendar(),
          today,
        )[0],
      },
      signal,
      { now: clock },
    ),
    'portal request',
  )

  const occupied = await open(db, cast, signal, {
    parcel: '007012000000',
    title: 'Garage finished and occupied',
    typeKey: 'BP',
    values: BUILDING_VALUES,
    submittedOn: '2027-03-15',
  })
  await completeAndReview(occupied, '2027-03-16', '2027-03-17')
  await readyToIssue(occupied, '2027-03-30')
  await occupied.step('issued', '2027-04-02')
  await run(occupied.applicationId, 'final', {
    day: days.recent,
    slot: SECOND_SLOT,
    outcome: { result: 'passed' },
  })
  const [occupiedRow] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, occupied.applicationId))
  must(
    await issueCertificateOfOccupancy(
      db,
      store(deps),
      cast.staff,
      {
        applicationId: occupied.applicationId,
        issuedOn: days.recent,
        expectedRowVersion: occupiedRow?.rowVersion ?? 1,
      },
      signal,
      { now: noon(days.recent) },
    ),
    'certificate',
  )

  const appealed = await applicationByTitle(db, 'Barn conversion under appeal')
  const footing = await typeId(appealed, 'footing')
  await db.transaction(async (tx) => {
    await tx.insert(inspections).values({
      applicationId: appealed,
      checklistVersionId: footing.checklistVersionId,
      inspectionType: 'footing',
      isFinal: false,
      channel: 'phone',
      requestedByUserId: cast.staff.userId,
      contactName: 'Pat Contractor',
      contactPhone: '603-555-0142',
      status: 'scheduled',
      inspectorUserId: inspector.userId,
      scheduledDate: days.recent,
      startMinute: FIRST_SLOT,
      durationMinutes: 60,
    })
    await cancelOpenInspections(tx, appealed, 'permit_suspended', signal)
  })
  return true
}

function store(deps: SeedInspectionsDeps): ObjectStore {
  return deps.store ?? getObjectStore()
}

async function attachPhoto(
  db: Db,
  objectStore: ObjectStore,
  inspector: Awaited<ReturnType<typeof actorFor>>,
  inspectionId: string,
  signal: AbortSignal,
): Promise<void> {
  const stored = await storeGeneratedBytes(db, objectStore, TINY_JPEG, 'image/jpeg', signal)
  await db.transaction((tx) =>
    attachDocument(
      tx,
      inspector,
      {
        target: { kind: 'inspection', id: inspectionId },
        title: 'Stair opening without blocking',
        docKind: 'inspection_photo',
        audiences: ['project_parties'],
        isPublic: false,
        file: { sha256: stored.sha256, filename: 'stair-opening.jpg', contentType: 'image/jpeg' },
      },
      signal,
    ),
  )
}
