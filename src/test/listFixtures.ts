import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { abutterLists, applications } from '@/db/schema'
import { setApplicantParcels } from '@/features/abutters/applicantParcels'
import { recordDesDetermination } from '@/features/boards/des500'
import { activeBoards } from '@/features/boards/townBoards'
import { demoBoardSettings } from '@/features/demo/demoBoardNotices'
import { recordRosterReview } from '@/features/rosters/reviews'
import { importScenario } from '@/test/abutterWorld'
import {
  type BoardWorld,
  recordNoRegionalImpact,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal

export const LIST_NOW = new Date('2027-03-24T16:00:00Z')

export interface ListWorld {
  ids: Record<string, string>
  applicationId: string
}

export async function publishProjectionSettings(db: Db, world: BoardWorld): Promise<void> {
  const defaults = demoBoardSettings(await activeBoards(db))
  await saveAndPublish(db, world.admin, 'board_settings', 'default', {
    ...defaults,
    abutters: {
      ...defaults.abutters,
      projectionEnabled: true,
      layersConfirmedBy: 'Land Use Technician',
      layersConfirmedOn: '2027-02-01',
    },
  })
}

export async function prepareListWorld(
  db: Db,
  world: BoardWorld,
  options: { receivedOn?: string; typeKey?: string; parcel?: string } = {},
): Promise<ListWorld> {
  const ids = await importScenario(db, world.staff)
  await publishProjectionSettings(db, world)
  const typeKey = options.typeKey ?? world.pbTypeKey
  const applicationId = await submitBoardApplication(
    db,
    world,
    typeKey,
    options.receivedOn ?? '2027-03-24',
  )
  const set = await setApplicantParcels(
    db,
    world.staff,
    { applicationId, parcelIds: [ids[options.parcel ?? 'A'] ?? ''] },
    signal,
  )
  if (!set.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'applicant parcels failed')
  await db
    .update(applications)
    .set({ values: { applicant_mailing_address: '12 Osprey Lane, Alder Pond NH 03999' } })
    .where(eq(applications.id, applicationId))
  await recordRosterReview(
    db,
    world.staff,
    { kind: 'restrictions', reviewedOn: '2027-03-01' as CivilDate },
    signal,
  )
  await recordNoRegionalImpact(db, world, applicationId)
  await recordDesDetermination(
    db,
    world.staff,
    {
      applicationId,
      determination: 'not_applicable',
      reason: 'No water body near the building site',
    },
    signal,
    LIST_NOW,
  )
  return { ids, applicationId }
}

export async function issueFixtureList(
  db: Db,
  world: BoardWorld,
  applicationId: string,
  drawnOn: string,
  version = 1,
): Promise<void> {
  await db.insert(abutterLists).values({
    applicationId,
    version,
    status: 'issued',
    strategyKey: 'nh.abutters.adjacency_projection',
    strategyVersion: 1,
    resolverKey: 'nh.recipients.v1',
    resolverVersion: 1,
    drawnOn,
    layers: {},
    incomplete: { strategy: [], resolver: [] },
    issuedBy: world.staff.userId,
    issuedAt: new Date(`${drawnOn}T16:00:00Z`),
    snapshot: { recipients: [] },
    snapshotSha256: 'fixture',
    createdBy: world.staff.userId,
  })
}
