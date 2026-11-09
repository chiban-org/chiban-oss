import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applicationConditions, associationRosters, restrictionHoldings, users } from '@/db/schema'
import { loadLotConditions } from '@/features/parcels/lotConditions'
import { loadNextLotInspection } from '@/features/parcels/lotInspection'
import { loadNoticeRecipients, noticeRecipientsText } from '@/features/rosters/noticeRecipients'
import { makeApplication, type PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { insertInspection, setupInspectionWorld } from '@/test/inspectionFixtures'
import type { CivilDate } from '@/types/civilDate'

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
