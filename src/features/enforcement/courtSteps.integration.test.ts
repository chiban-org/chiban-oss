import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  enforcementCases,
  enforcementOrders,
  orderCourtSteps,
  orderServiceRecipients,
} from '@/db/schema'
import type { SubjectDue } from '@/features/clocks/subjectDue'
import { recordAnswer } from '@/features/enforcement/answers'
import { recordCourtStep } from '@/features/enforcement/courtSteps'
import { listRecipient, recordRoleCheck, recordServiceEvent } from '@/features/enforcement/service'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  completeService,
  type EnforcementWorld,
  type IssuedOrder,
  issuedOrder,
  makeStepper,
  setupEnforcementWorld,
  uploadProof,
} from '@/test/enforcementFixtures'
import { makeTestStore } from '@/test/minio'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const LATER = new Date('2027-07-20T15:00:00Z')
let handle: TestDb
let store: ObjectStore
let world: EnforcementWorld
let order: IssuedOrder

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  world = await setupEnforcementWorld(handle.db)
  order = await issuedOrder(handle.db, store, world)
  step = makeStepper(handle.db, store, world, order, LATER)
})
afterEach(async () => {
  await handle.drop()
})

async function courtDoc() {
  return await uploadProof(
    handle.db,
    store,
    world.staff,
    order.caseId,
    'Court filing',
    'court_document',
  )
}

let step: ReturnType<typeof makeStepper>

async function recipientDue(recipientId: string): Promise<SubjectDue | null> {
  const [row] = await handle.db
    .select()
    .from(orderServiceRecipients)
    .where(eq(orderServiceRecipients.id, recipientId))
  return (row?.answerDue as SubjectDue | null) ?? null
}

async function orderStatus() {
  const [row] = await handle.db
    .select()
    .from(enforcementOrders)
    .where(eq(enforcementOrders.id, order.orderId))
  return row?.status
}

describe('answer periods and the motion gate', () => {
  it('service on 2027-03-01 sets an answer due of 2027-03-22 rolled from 2027-03-21', async () => {
    const served = await completeService(handle.db, store, world, order, '2027-03-01')
    const due = await recipientDue(served.ownerId)
    expect(due).toMatchObject({
      due: '2027-03-22',
      rolledFrom: '2027-03-21',
      ruleKey: 'nh.enf.answer_zoning',
    })
    expect(due?.countingMethod).toContain('RSA 21:35 II')
  })

  it('motion on 2027-03-22 is answer_period_running for service on 2027-03-01', async () => {
    await completeService(handle.db, store, world, order, '2027-03-01')
    expect((await step('filed_with_clerk', '2027-03-10')).ok).toBe(true)
    expect(await step('motion_to_enforce', '2027-03-22')).toEqual({
      ok: false,
      error: 'answer_period_running',
    })
  })

  it('motion on 2027-03-23 after clerk filing on 2027-03-10 opens', async () => {
    await completeService(handle.db, store, world, order, '2027-03-01')
    await step('filed_with_clerk', '2027-03-10')
    expect((await step('motion_to_enforce', '2027-03-23')).ok).toBe(true)
    expect(await orderStatus()).toBe('motion_filed')
  })

  it('clerk filing on 2027-04-01 holds the motion until 2027-04-06', async () => {
    await completeService(handle.db, store, world, order, '2027-03-01')
    await step('filed_with_clerk', '2027-04-01')
    expect(await step('motion_to_enforce', '2027-04-05')).toEqual({
      ok: false,
      error: { filingLeadUntil: '2027-04-06' },
    })
    expect((await step('motion_to_enforce', '2027-04-06')).ok).toBe(true)
  })

  it('a recorded answer blocks the motion as answered', async () => {
    const served = await completeService(handle.db, store, world, order, '2027-03-01')
    await step('filed_with_clerk', '2027-03-10')
    const answered = await recordAnswer(
      handle.db,
      world.staff,
      { recipientId: served.ownerId, answeredOn: d('2027-03-15'), documentId: await courtDoc() },
      signal,
    )
    expect(answered.ok).toBe(true)
    expect(await orderStatus()).toBe('answered')
    expect(await step('motion_to_enforce', '2027-03-23')).toEqual({ ok: false, error: 'answered' })
  })

  it('clerk filing with an unserved mortgagee is filing_needs_complete_service', async () => {
    await completeService(handle.db, store, world, order, '2027-03-01')
    await listRecipient(
      handle.db,
      world.staff,
      {
        orderId: order.orderId,
        role: 'mortgagee_of_record',
        name: 'Alder Savings',
        address: '1 Main Street',
        source: 'Registry book 1234 page 56',
      },
      signal,
    )
    await recordRoleCheck(
      handle.db,
      world.staff,
      {
        orderId: order.orderId,
        role: 'mortgagee_of_record',
        outcome: 'recipients_listed',
        basis: 'Registry search',
        checkedOn: d('2027-03-02'),
      },
      signal,
    )
    expect(await step('filed_with_clerk', '2027-03-10')).toEqual({
      ok: false,
      error: 'filing_needs_complete_service',
    })
  })

  it('owner served by publication ending 2027-03-25 has answer due 2027-04-14', async () => {
    const owner = await listRecipient(
      handle.db,
      world.staff,
      {
        orderId: order.orderId,
        role: 'record_owner',
        name: 'Pat Owner',
        address: 'Unknown',
        source: 'Registry book 1234 page 56',
      },
      signal,
    )
    if (!owner.ok) throw new Error('owner')
    for (const [role, outcome] of [
      ['record_owner', 'owner_not_found'],
      ['taxpayer', 'same_as_owner'],
      ['occupying_tenant', 'none_exist'],
      ['person_in_control', 'none_exist'],
      ['mortgagee_of_record', 'none_exist'],
    ] as const) {
      await recordRoleCheck(
        handle.db,
        world.staff,
        {
          orderId: order.orderId,
          role,
          outcome,
          basis: 'Search on file',
          checkedOn: d('2027-03-01'),
        },
        signal,
      )
    }
    const events = [
      ['posting_on_property', '2027-03-02'],
      ['newspaper_publication', '2027-03-04'],
      ['newspaper_publication', '2027-03-11'],
      ['newspaper_publication', '2027-03-18'],
      ['newspaper_publication', '2027-03-25'],
    ] as const
    for (const [method, servedOn] of events) {
      const recorded = await recordServiceEvent(
        handle.db,
        world.staff,
        {
          orderId: order.orderId,
          recipientId: null,
          method,
          servedOn: d(servedOn),
          ...(method === 'newspaper_publication' ? { newspaper: 'Alder Pond Gazette' } : {}),
          proofDocumentId: await uploadProof(handle.db, store, world.staff, order.caseId, 'Proof'),
        },
        signal,
      )
      if (!recorded.ok) throw new Error(recorded.error)
    }
    expect(await recipientDue(owner.value.recipientId)).toMatchObject({
      due: '2027-04-14',
      rolledFrom: null,
    })
  })

  it('an owner listed after posting and publication gets an answer due that holds the motion', async () => {
    for (const [role, outcome] of [
      ['record_owner', 'owner_not_found'],
      ['taxpayer', 'same_as_owner'],
      ['occupying_tenant', 'none_exist'],
      ['person_in_control', 'none_exist'],
      ['mortgagee_of_record', 'none_exist'],
    ] as const) {
      await recordRoleCheck(
        handle.db,
        world.staff,
        {
          orderId: order.orderId,
          role,
          outcome,
          basis: 'Search on file',
          checkedOn: d('2027-03-01'),
        },
        signal,
      )
    }
    for (const [method, servedOn] of [
      ['posting_on_property', '2027-03-02'],
      ['newspaper_publication', '2027-03-04'],
      ['newspaper_publication', '2027-03-11'],
      ['newspaper_publication', '2027-03-18'],
      ['newspaper_publication', '2027-03-25'],
    ] as const) {
      const recorded = await recordServiceEvent(
        handle.db,
        world.staff,
        {
          orderId: order.orderId,
          recipientId: null,
          method,
          servedOn: d(servedOn),
          ...(method === 'newspaper_publication' ? { newspaper: 'Alder Pond Gazette' } : {}),
          proofDocumentId: await uploadProof(handle.db, store, world.staff, order.caseId, 'Proof'),
        },
        signal,
      )
      if (!recorded.ok) throw new Error(recorded.error)
    }
    const owner = await listRecipient(
      handle.db,
      world.staff,
      {
        orderId: order.orderId,
        role: 'record_owner',
        name: 'Pat Owner',
        address: 'Unknown',
        source: 'Registry book 1234 page 56',
      },
      signal,
    )
    if (!owner.ok) throw new Error('owner')
    expect(await recipientDue(owner.value.recipientId)).toMatchObject({ due: '2027-04-14' })
    expect((await step('filed_with_clerk', '2027-03-26')).ok).toBe(true)
    expect(await step('motion_to_enforce', '2027-04-10')).toEqual({
      ok: false,
      error: 'answer_period_running',
    })
  })

  it('a court step with a photo instead of a court document is proof_required', async () => {
    await completeService(handle.db, store, world, order, '2027-03-01')
    const photo = await uploadProof(
      handle.db,
      store,
      world.staff,
      order.caseId,
      'Photo',
      'enforcement_photo',
    )
    expect(await step('filed_with_clerk', '2027-03-10', { documentId: photo })).toEqual({
      ok: false,
      error: 'proof_required',
    })
  })

  it('a date in the future is refused', async () => {
    await completeService(handle.db, store, world, order, '2027-03-01')
    expect(await step('filed_with_clerk', '2027-08-01')).toEqual({
      ok: false,
      error: 'date_in_future',
    })
  })

  it('motion recorded without enforcement.record_service is forbidden', async () => {
    await completeService(handle.db, store, world, order, '2027-03-01')
    const reviewer = await staffActor(handle.db, 'reviewer')
    const result = await recordCourtStep(
      handle.db,
      reviewer,
      {
        orderId: order.orderId,
        kind: 'motion_to_enforce',
        occurredOn: d('2027-03-23'),
        court: 'District Court',
        documentId: await courtDoc(),
      },
      signal,
      LATER,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })
})
