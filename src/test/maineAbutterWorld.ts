import { ME_PACK } from '@packs/me'
import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { applications } from '@/db/schema'
import { setApplicantParcels } from '@/features/abutters/applicantParcels'
import type { AbuttersSpec } from '@/features/abutters/roles'
import { activeBoards } from '@/features/boards/townBoards'
import { demoBoardSettings } from '@/features/demo/demoBoardNotices'
import type { StatePack } from '@/features/packs/schema'
import { type BoardWorld, boardTypeBody, submitBoardApplication } from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'

const signal = new AbortController().signal

export const ME_TEST_CLASSIFICATION = 'me.test_board_review'
export const ME_TEST_TYPE_KEY = 'MEPB'
export const ME_APPLICANT_ADDRESS = '12 Osprey Lane, Fernhollow, ME 04000'

export const ME_TEST_CONTACTS = {
  key: 'default',
  commission: null,
  nhDes: null,
  municipalities: [
    {
      key: 'pine_river',
      name: 'Town of Pine River',
      mailingAddress: '4 Town Hall Road, Pine River',
      clerk: { name: 'Pine River Town Clerk', mailingAddress: '4 Town Hall Road, Pine River' },
      reviewingAuthority: {
        name: 'Pine River Planning Board',
        mailingAddress: '6 Board Lane, Pine River',
      },
    },
    {
      key: 'dunmore',
      name: 'Town of Dunmore',
      mailingAddress: '9 Common Street, Dunmore',
      clerk: { name: 'Dunmore Town Clerk', mailingAddress: '9 Common Street, Dunmore' },
    },
  ],
  waterSuppliers: [
    {
      key: 'fernhollow_water',
      name: 'Fernhollow Water District',
      mailingAddress: '2 Pump Road, Fernhollow',
    },
  ],
}

export function maineBoardPack(abutters: Omit<AbuttersSpec, 'strategyKey' | 'resolverKey'>) {
  const classifications = [
    ...ME_PACK.manifest.classifications,
    {
      key: ME_TEST_CLASSIFICATION,
      label: 'Test board review',
      mandatoryRuleKeys: [],
      boardKind: 'planning_board' as const,
      abutters: {
        strategyKey: 'me.adjacent_buffer.v1',
        resolverKey: 'me.recipients.v1',
        ...abutters,
      },
      noticeRequirementKeys: [],
      requiredSubsteps: [],
      directIssueAllowed: false,
      hearing: 'required' as const,
      recordingRequired: false,
      appealRights: '',
    },
  ]
  const pack: StatePack = {
    ...ME_PACK,
    manifest: { ...ME_PACK.manifest, classifications },
    classificationKeys: classifications.map((c) => c.key),
  }
  return pack
}

export async function publishMaineBuffer(
  db: Db,
  world: BoardWorld,
  bufferFt: number | null,
): Promise<void> {
  const defaults = demoBoardSettings(await activeBoards(db))
  await saveAndPublish(db, world.admin, 'board_settings', 'default', {
    ...defaults,
    abutters: { ...defaults.abutters, projectionEnabled: false, bufferFt },
  })
}

export async function submitMaineApplication(
  db: Db,
  world: BoardWorld,
  pack: StatePack,
  applicantParcelId: string,
): Promise<string> {
  await saveAndPublish(
    db,
    world.admin,
    'application_type',
    ME_TEST_TYPE_KEY,
    boardTypeBody(ME_TEST_CLASSIFICATION, ME_TEST_TYPE_KEY, 'MP', {}, pack),
  )
  const applicationId = await submitBoardApplication(db, world, ME_TEST_TYPE_KEY, '2027-03-24')
  const set = await setApplicantParcels(
    db,
    world.staff,
    { applicationId, parcelIds: [applicantParcelId] },
    signal,
  )
  if (!set.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'applicant parcels failed')
  await db
    .update(applications)
    .set({ values: { applicant_mailing_address: ME_APPLICANT_ADDRESS } })
    .where(eq(applications.id, applicationId))
  return applicationId
}
