import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, feeAssessments } from '@/db/schema'
import { issueList } from '@/features/abutters/issue'
import { generateList, selectParcel } from '@/features/abutters/lists'
import { noticeCostSummary, terminateForUnpaidNoticeCosts } from '@/features/abutters/noticeCosts'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { addProfessional } from '@/features/rosters/professionals'
import { addRestriction } from '@/features/rosters/restrictions'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let lw: ListWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  lw = await prepareListWorld(handle.db, world)
})
afterEach(async () => {
  await handle.drop()
})

async function pro(name: string) {
  await addProfessional(
    handle.db,
    world.staff,
    {
      applicationId: lw.applicationId,
      name,
      profession: 'engineer',
      businessAddress: `${name} Office, Alder Pond NH`,
      sealOnPlat: true,
    },
    signal,
  )
}

async function issueNew() {
  const made = await generateList(
    handle.db,
    world.staff,
    { applicationId: lw.applicationId },
    signal,
    LIST_NOW,
  )
  if (!made.ok) throw new Error('generate failed')
  const issued = await issueList(
    handle.db,
    world.staff,
    { listId: made.value.listId },
    signal,
    LIST_NOW,
  )
  if (!issued.ok) throw new Error(`issue failed ${JSON.stringify(issued.error)}`)
  return made.value
}

async function twelveRecipients() {
  const first = await generateList(
    handle.db,
    world.staff,
    { applicationId: lw.applicationId },
    signal,
    LIST_NOW,
  )
  if (!first.ok) throw new Error('generate failed')
  await selectParcel(
    handle.db,
    world.staff,
    {
      listId: first.value.listId,
      parcelId: lw.ids.N5 ?? '',
      crossing: 'street',
      note: 'Across the road',
    },
    signal,
    LIST_NOW,
  )
  await pro('Rae Fenn')
  await pro('Nell Ostrand')
  const refreshed = await generateList(
    handle.db,
    world.staff,
    { applicationId: lw.applicationId },
    signal,
    LIST_NOW,
  )
  if (!refreshed.ok) throw new Error('regenerate failed')
  const issued = await issueList(
    handle.db,
    world.staff,
    { listId: refreshed.value.listId },
    signal,
    LIST_NOW,
  )
  if (!issued.ok) throw new Error(`issue failed ${JSON.stringify(issued.error)}`)
}

describe('notice costs', () => {
  it('notice cost counts unique mailings', async () => {
    await twelveRecipients()
    const summary = await noticeCostSummary(handle.db, lw.applicationId, signal)
    expect(summary.mailings).toBe(12)
    expect(summary.lines).toMatchObject([
      { code: 'notice_mail', assessedCents: 12000, dueCents: 12000 },
    ])
    expect(summary.dueCents).toBe(12000)
  })

  it('issuing version 2 with 14 recipients reassesses to 14000', async () => {
    await twelveRecipients()
    await pro('Orrin Pike')
    await addRestriction(
      handle.db,
      world.staff,
      {
        parcelId: lw.ids.A ?? '',
        holderName: 'Alder Valley Land Trust',
        holderMailingAddress: '2 Trust Lane, Alder Pond NH',
        restrictionKind: 'conservation',
        recordedReference: 'Book 12, Page 40',
      },
      signal,
    )
    await issueNew()
    const summary = await noticeCostSummary(handle.db, lw.applicationId, signal)
    expect(summary.mailings).toBe(14)
    expect(summary.lines[0]?.assessedCents).toBe(14000)
    const assessments = await handle.db
      .select()
      .from(feeAssessments)
      .where(
        and(
          eq(feeAssessments.applicationId, lw.applicationId),
          eq(feeAssessments.stage, 'at_notice'),
        ),
      )
    expect(assessments.map((a) => a.totalCents).sort()).toEqual([12000, 14000])
  })

  it('an owner counted once for two parcels is one mailing', async () => {
    await handle.db.execute(
      (await import('drizzle-orm'))
        .sql`update parcels set owner_name = 'Wren, Isolde', mailing_address = 'PO Box 302, Alder Pond NH 03999' where id = ${lw.ids.SE}`,
    )
    await issueNew()
    expect((await noticeCostSummary(handle.db, lw.applicationId, signal)).mailings).toBe(8)
  })

  it('no issued list leaves the cost unknown', async () => {
    const summary = await noticeCostSummary(handle.db, lw.applicationId, signal)
    expect(summary).toEqual({ mailings: null, lines: [], dueCents: 0 })
  })
})

describe('terminating for unpaid notice costs', () => {
  it('terminate for unpaid costs denies with closure_reason notice_costs_unpaid', async () => {
    await issueNew()
    const result = await terminateForUnpaidNoticeCosts(
      handle.db,
      world.staff,
      { applicationId: lw.applicationId, reason: 'Notice costs not paid within the period' },
      signal,
      LIST_NOW,
    )
    expect(result).toEqual({ ok: true, value: undefined })
    const [app] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, lw.applicationId))
    expect(app).toMatchObject({ state: 'denied', closureReason: 'notice_costs_unpaid' })
  })

  it('terminate with costs paid is notice_costs_paid', async () => {
    await issueNew()
    const [assessment] = await handle.db
      .select()
      .from(feeAssessments)
      .where(
        and(
          eq(feeAssessments.applicationId, lw.applicationId),
          eq(feeAssessments.stage, 'at_notice'),
        ),
      )
    const paid = await recordCounterPayment(
      handle.db,
      world.staff,
      {
        method: 'cash',
        amountCents: 9000,
        payerName: 'Osprey Point Partners LLC',
        allocations: [
          {
            targetKind: 'fee_assessment_line',
            applicationId: lw.applicationId,
            feeAssessmentId: assessment?.id ?? '',
            stage: 'at_notice',
            feeCode: 'notice_mail',
            amountCents: 9000,
          },
        ],
      },
      signal,
      LIST_NOW,
    )
    expect(paid.ok).toBe(true)
    expect((await noticeCostSummary(handle.db, lw.applicationId, signal)).dueCents).toBe(0)
    expect(
      await terminateForUnpaidNoticeCosts(
        handle.db,
        world.staff,
        { applicationId: lw.applicationId, reason: 'Late' },
        signal,
        LIST_NOW,
      ),
    ).toEqual({ ok: false, error: 'notice_costs_paid' })
  })

  it('reviewer terminating is forbidden', async () => {
    await issueNew()
    expect(
      await terminateForUnpaidNoticeCosts(
        handle.db,
        world.reviewer,
        { applicationId: lw.applicationId, reason: 'Late' },
        signal,
        LIST_NOW,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })
})
