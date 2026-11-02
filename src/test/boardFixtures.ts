import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import type { Actor } from '@/features/auth/actor'
import { BOARD_SETTINGS_DEFAULT } from '@/features/boards/boardSettings'
import { scheduleMeeting } from '@/features/boards/meetings'
import { recordRegionalImpactDetermination } from '@/features/building/regionalImpact'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal

export const PB_MEETINGS = [
  '2027-03-10',
  '2027-03-24',
  '2027-04-14',
  '2027-04-28',
  '2027-05-12',
  '2027-05-26',
  '2027-07-14',
]

export const BOARD_FEES = {
  key: 'board-fees',
  lines: [
    {
      code: 'application',
      label: 'Application fee',
      due: 'at_intake',
      expr: { op: 'flat', cents: 10000 },
    },
    {
      code: 'notice_mail',
      label: 'Mailed notice to abutters',
      due: 'at_notice',
      expr: {
        op: 'per_unit',
        source: { kind: 'count_of', what: 'abutters_on_issued_list' },
        centsPerUnit: 1000,
      },
    },
  ],
}

export interface BoardWorld extends PermitWorld {
  pbTypeKey: string
  zbaTypeKey: string
}

export function boardTypeBody(
  classificationKey: (typeof NH_CLASSIFICATIONS)[number]['key'],
  key: string,
  prefix: string,
  overrides: Partial<ApplicationTypeBody> = {},
): ApplicationTypeBody {
  const classification = NH_CLASSIFICATIONS.find((c) => c.key === classificationKey)
  if (classification === undefined) {
    throw new AppError(ErrorIds.DB_INVARIANT, `no classification ${classificationKey}`)
  }
  return appTypeBody({
    key,
    label: key,
    prefix,
    classification: classificationKey,
    feeScheduleKey: 'board-fees',
    payTiming: 'at_intake',
    bindings: classification.mandatoryRuleKeys,
    templateKeys: [],
    workflow: {
      allowsDirectIssue: false,
      substeps: [
        { state: 'submitted', key: 'filed', label: 'Filed' },
        { state: 'submitted', key: 'acceptance_scheduled', label: 'Acceptance meeting set' },
        { state: 'under_review', key: 'hearing', label: 'Hearing' },
        { state: 'under_review', key: 'deliberation', label: 'Deliberation' },
        { state: 'decided', key: 'conditions_precedent', label: 'Conditions precedent' },
        { state: 'decided', key: 'certified_by_selectmen', label: 'Certified by the selectmen' },
      ],
      closesOn: 'staff_closes',
    },
    ...overrides,
  })
}

export async function scheduleMeetings(
  db: Db,
  actor: Actor,
  board: 'planning_board' | 'zba',
  dates: string[],
): Promise<void> {
  for (const meetingDate of dates) {
    const made = await scheduleMeeting(
      db,
      actor,
      { board, meetingDate: meetingDate as CivilDate, kind: 'regular' },
      signal,
    )
    if (!made.ok) throw new AppError(ErrorIds.DB_INVARIANT, `meeting ${meetingDate} failed`)
  }
}

export async function setupBoardWorld(
  db: Db,
  options: { pbMeetings?: string[]; zbaMeetings?: string[] } = {},
): Promise<BoardWorld> {
  const world = await setupPermitWorld(db)
  await saveAndPublish(db, world.admin, 'fee_schedule', 'board-fees', BOARD_FEES)
  await saveAndPublish(db, world.admin, 'board_settings', 'default', BOARD_SETTINGS_DEFAULT)
  const pbTypeKey = 'SPR'
  const zbaTypeKey = 'VAR'
  await saveAndPublish(
    db,
    world.admin,
    'application_type',
    pbTypeKey,
    boardTypeBody('nh.pb_site_plan', pbTypeKey, 'SPR'),
  )
  await saveAndPublish(
    db,
    world.admin,
    'application_type',
    zbaTypeKey,
    boardTypeBody('nh.zba_variance', zbaTypeKey, 'VAR'),
  )
  await scheduleMeetings(db, world.staff, 'planning_board', options.pbMeetings ?? PB_MEETINGS)
  if (options.zbaMeetings !== undefined) {
    await scheduleMeetings(db, world.staff, 'zba', options.zbaMeetings)
  }
  return { ...world, pbTypeKey, zbaTypeKey }
}

export async function submitBoardApplication(
  db: Db,
  world: BoardWorld,
  typeKey: string,
  receivedOn: string,
): Promise<string> {
  const now = new Date(`${receivedOn}T16:00:00Z`)
  const made = await makeApplication(db, world, {}, now, typeKey)
  const type = boardTypeBody('nh.pb_site_plan', typeKey, typeKey)
  const submitted = await submitApplication(
    db,
    world.applicant,
    {
      applicationId: made.applicationId,
      values: { classification: 'residential' },
      attestation: { statementSha256: attestationHash(type.attestationText) },
    },
    signal,
    now,
  )
  if (!submitted.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, `submit failed: ${JSON.stringify(submitted.error)}`)
  }
  return made.applicationId
}

export async function recordNoRegionalImpact(
  db: Db,
  world: BoardWorld,
  applicationId: string,
  determination: 'yes' | 'no' = 'no',
): Promise<void> {
  const recorded = await recordRegionalImpactDetermination(
    db,
    world.staff,
    { applicationId, determination, determinedOn: '2027-03-01' as CivilDate },
    signal,
  )
  if (!recorded.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'determination failed')
}

export const ALDER_POND_CONTACTS = {
  key: 'default',
  commission: {
    name: 'Alder Valley Regional Planning Commission',
    mailingAddress: '18 Commission Way, Alder Valley NH 03999',
  },
  municipalities: [
    {
      key: 'pine_river',
      name: 'Town of Pine River',
      mailingAddress: '4 Town Hall Road, Pine River NH 03000',
    },
    {
      key: 'dunmore',
      name: 'Town of Dunmore',
      mailingAddress: '9 Common Street, Dunmore NH 03001',
    },
  ],
  nhDes: {
    name: 'NH Department of Environmental Services',
    mailingAddress: '1 Example Way, Concord NH 03301',
  },
}

export async function publishRegionalContacts(db: Db, world: BoardWorld): Promise<void> {
  await saveAndPublish(db, world.admin, 'regional_contacts', 'default', ALDER_POND_CONTACTS)
}
