import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { Actor } from '@/features/auth/actor'
import { BOARD_SETTINGS_DEFAULT } from '@/features/boards/boardSettings'
import { scheduleMeeting } from '@/features/boards/meetings'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
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
