import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  applicationConditions,
  associationRosters,
  documents,
  restrictionHoldings,
  users,
} from '@/db/schema'
import { recordDecisionRecording, recordFinalWrittenApproval } from '@/features/decisions/recording'
import { setActivePackForTest } from '@/features/packs/registry'
import { loadLotConditions } from '@/features/parcels/lotConditions'
import { loadNextLotInspection } from '@/features/parcels/lotInspection'
import { loadNoticeRecipients, noticeRecipientsText } from '@/features/rosters/noticeRecipients'
import { markUnrecordedVoid } from '@/jobs/clocksDaily'
import { makeApplication, type PermitWorld } from '@/test/applicationFixtures'
import { setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decideUnderXx, HEARING_DATE } from '@/test/deliveryFixtures'
import { insertInspection, setupInspectionWorld } from '@/test/inspectionFixtures'
import { XX_RECORDING } from '@/test/packs/xx/variants'
import { addDays, type CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const TODAY = '2027-03-02' as CivilDate
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = (await setupInspectionWorld(handle.db)).world
})
afterAll(async () => {
  await handle.drop()
})

async function condition(
  applicationId: string,
  code: string,
  status: 'unmet' | 'met' | 'waived' = 'unmet',
) {
  await handle.db.insert(applicationConditions).values({
    applicationId,
    code,
    textSnapshot: `Condition ${code} text.`,
    blocksIssuance: false,
    status,
    changedBy: world.staff.userId,
  })
}

describe('conditions and decisions in force on a lot', () => {
  it('lists conditions on permits in force, leaving out waived ones and ended permits', async () => {
    const issued = await makeApplication(handle.db, world, {
      state: 'issued',
      issuedOn: '2027-01-10',
    })
    await condition(issued.applicationId, 'C-1')
    await condition(issued.applicationId, 'C-2', 'waived')
    const expired = await makeApplication(handle.db, world, {
      state: 'expired',
      issuedOn: '2026-01-10',
    })
    await condition(expired.applicationId, 'C-9')
    const bare = await makeApplication(handle.db, world, {
      state: 'issued',
      issuedOn: '2027-02-01',
    })

    const found = await loadLotConditions(handle.db, world.parcelId, signal)
    expect(found.map((d) => d.applicationId)).toEqual([issued.applicationId])
    expect(found[0]).toMatchObject({
      outcome: { label: 'Issued', chip: 'passed' },
      decidedOn: '2027-01-10',
      conditions: [{ code: 'C-1', text: 'Condition C-1 text.' }],
    })
    expect(found.some((d) => d.applicationId === bare.applicationId)).toBe(false)
  })
})

describe('the next inspection on a lot', () => {
  it('picks the earliest scheduled inspection with its contact, access notes and inspector', async () => {
    const app = await makeApplication(handle.db, world, { state: 'issued' }, undefined, 'EL')
    const [inspector] = await handle.db
      .select({ id: users.id, name: users.displayName })
      .from(users)
      .where(eq(users.id, world.staff.userId))
    await insertInspection(handle.db, app.applicationId, 'rough', {
      status: 'scheduled',
      scheduledDate: '2027-05-09',
    })
    const soonest = await insertInspection(handle.db, app.applicationId, 'rough', {
      status: 'scheduled',
      scheduledDate: '2027-05-06',
      startMinute: 9 * 60,
      inspectorUserId: inspector?.id ?? null,
      contactPhone: '603-555-0110',
      accessNotes: 'Dog in the yard.',
    })
    await insertInspection(handle.db, app.applicationId, 'rough', { status: 'requested' })

    const next = await loadNextLotInspection(handle.db, world.parcelId, signal)
    expect(next).toMatchObject({
      id: soonest,
      applicationId: app.applicationId,
      number: app.number,
      inspectionType: 'rough',
      scheduledDate: '2027-05-06',
      startMinute: 540,
      inspectorName: inspector?.name,
      contactName: 'Pat Contact',
      contactPhone: '603-555-0110',
      accessNotes: 'Dog in the yard.',
    })
  })
})

describe('who notices go to', () => {
  it('names the owner of record when no association, park or holder is on file', async () => {
    const recipients = await loadNoticeRecipients(
      handle.db,
      { parcelId: world.parcelId, today: TODAY },
      signal,
    )
    expect(noticeRecipientsText(recipients)).toEqual(['Owner of record'])
  })

  it('names the association and restriction holder, leaving out ended entries', async () => {
    await handle.db.insert(associationRosters).values({
      parcelId: world.parcelId,
      associationName: 'Heron Cove Condominium Association',
      officers: [],
      asOf: '2027-01-01',
      updatedBy: world.staff.userId,
    })
    await handle.db.insert(restrictionHoldings).values([
      {
        parcelId: world.parcelId,
        holderName: 'Alder Pond Land Trust',
        holderMailingAddress: 'PO Box 1',
        restrictionKind: 'conservation',
        recordedReference: 'Book 1 page 2',
        createdBy: world.staff.userId,
      },
      {
        parcelId: world.parcelId,
        holderName: 'Old Holder',
        holderMailingAddress: 'PO Box 2',
        restrictionKind: 'preservation',
        recordedReference: 'Book 3 page 4',
        endedOn: '2027-01-01',
        createdBy: world.staff.userId,
      },
    ])
    const recipients = await loadNoticeRecipients(
      handle.db,
      { parcelId: world.parcelId, today: TODAY },
      signal,
    )
    expect(noticeRecipientsText(recipients)).toEqual([
      'Heron Cove Condominium Association officers',
      'Alder Pond Land Trust, restriction holder',
    ])
  })
})

describe('a variance that must be recorded on a lot', () => {
  const NOW = new Date('2027-09-30T16:00:00Z')
  const APPROVED = '2027-04-20' as CivilDate

  async function approvedVariance() {
    const variance = await makeTestDb()
    setActivePackForTest(XX_RECORDING)
    const board = await setupBoardWorld(variance.db, {
      zbaMeetings: [HEARING_DATE],
      pack: XX_RECORDING,
      classificationKey: 'xx.board_variance',
    })
    const made = await decideUnderXx(variance.db, board)
    await recordFinalWrittenApproval(
      variance.db,
      board.staff,
      { decisionId: made.decisionId, approvedOn: APPROVED },
      signal,
      NOW,
    )
    return { variance, board, made }
  }

  const outcomeOf = async (variance: TestDb, parcelId: string, applicationId: string) =>
    (await loadLotConditions(variance.db, parcelId, signal)).find(
      (e) => e.applicationId === applicationId,
    )?.outcome

  it('is labelled not valid until recorded, then plain once recorded', async () => {
    const { variance, board, made } = await approvedVariance()
    try {
      expect(await outcomeOf(variance, board.parcelId, made.applicationId)).toEqual({
        label: 'Approved, not valid until recorded',
        chip: 'neutral',
      })
      const [doc] = await variance.db
        .insert(documents)
        .values({
          recordKind: 'application',
          recordId: made.applicationId,
          title: 'Certificate of approval',
          docKind: 'attachment',
          createdByKind: 'system',
        })
        .returning({ id: documents.id })
      await recordDecisionRecording(
        variance.db,
        board.staff,
        {
          decisionId: made.decisionId,
          registry: 'Vellmora County Registry of Deeds',
          book: '4410',
          page: '212',
          recordedOn: '2027-05-10' as CivilDate,
          certificateDocumentId: doc?.id ?? '',
        },
        signal,
        NOW,
      )
      expect((await outcomeOf(variance, board.parcelId, made.applicationId))?.label).toBe('Granted')
    } finally {
      setActivePackForTest(null)
      await variance.drop()
    }
  })

  it('is labelled void once the period lapses and still shows on the parcel', async () => {
    const { variance, board, made } = await approvedVariance()
    try {
      await variance.db.transaction((tx) => markUnrecordedVoid(tx, addDays(APPROVED, 91), signal))
      expect(await outcomeOf(variance, board.parcelId, made.applicationId)).toEqual({
        label: 'Void, not recorded in time',
        chip: 'failed',
      })
    } finally {
      setActivePackForTest(null)
      await variance.drop()
    }
  })
})
