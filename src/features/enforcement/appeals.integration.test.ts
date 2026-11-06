import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enforcementOrders, orderServiceRecipients } from '@/db/schema'
import {
  certifyImminentPeril,
  dissolveRestrainingOrder,
  recordEnforcementAppeal,
  recordRestrainingOrder,
  resolveEnforcementAppeal,
} from '@/features/enforcement/appeals'
import { recordFinding } from '@/features/enforcement/findings'
import { addNote } from '@/features/enforcement/notes'
import { draftOrder, issueOrder } from '@/features/enforcement/orders'
import { listRecipient } from '@/features/enforcement/service'
import { recordServiceEvent } from '@/features/enforcement/serviceEvents'
import { stayBanner, stayFor } from '@/features/enforcement/stay'
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
import { makeTestStore } from '@/test/objectStore'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const LATER = new Date('2027-07-20T15:00:00Z')
let handle: TestDb
let store: ObjectStore
let world: EnforcementWorld
let order: IssuedOrder
let step: ReturnType<typeof makeStepper>

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

async function appeal(filedOn = '2027-03-05') {
  const filed = await recordEnforcementAppeal(
    handle.db,
    world.staff,
    {
      caseId: order.caseId,
      targetKind: 'order',
      targetId: order.orderId,
      filedOn: d(filedOn),
      appellantName: 'Pat Owner',
    },
    signal,
    LATER,
  )
  if (!filed.ok) throw new Error(filed.error)
  return filed.value.appealId
}

async function readyForMotion() {
  await completeService(handle.db, store, world, order, '2027-03-01')
}

describe('stay on appeal', () => {
  it('an appeal filed after today is refused', async () => {
    const filed = await recordEnforcementAppeal(
      handle.db,
      world.staff,
      {
        caseId: order.caseId,
        targetKind: 'order',
        targetId: order.orderId,
        filedOn: d('2027-07-21'),
        appellantName: 'Pat Owner',
      },
      signal,
      LATER,
    )
    expect(filed).toEqual({ ok: false, error: 'date_in_future' })
  })

  it('an appeal resolved after today is refused', async () => {
    const appealId = await appeal()
    const resolved = await resolveEnforcementAppeal(
      handle.db,
      world.staff,
      { appealId, resolvedOn: d('2027-07-21'), outcome: 'annulled' },
      signal,
      LATER,
    )
    expect(resolved).toEqual({ ok: false, error: 'date_in_future' })
  })

  it('motion during an unresolved appeal is stayed', async () => {
    await readyForMotion()
    await appeal()
    expect(await step('filed_with_clerk', '2027-03-10')).toEqual({ ok: false, error: 'stayed' })
    expect(await step('motion_to_enforce', '2027-03-23')).toEqual({ ok: false, error: 'stayed' })
  })

  it('certification by the issuing officer lifts the stay', async () => {
    await readyForMotion()
    const appealId = await appeal()
    const certified = await certifyImminentPeril(
      handle.db,
      world.staff,
      {
        appealId,
        categories: ['safety'],
        statement: 'The garage wall is leaning over the road.',
        certifiedOn: d('2027-03-06'),
      },
      signal,
    )
    expect(certified.ok).toBe(true)
    expect((await step('filed_with_clerk', '2027-03-10')).ok).toBe(true)
    expect((await stayFor(handle.db, order.caseId, d('2027-03-10'), signal)).stayed).toBe(false)
  })

  it('certification by another officer is not_issuing_officer', async () => {
    const appealId = await appeal()
    const result = await certifyImminentPeril(
      handle.db,
      world.inspector,
      { appealId, categories: ['safety'], statement: 'Leaning wall', certifiedOn: d('2027-03-06') },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'not_issuing_officer' })
  })

  it('certification needs at least one category', async () => {
    const appealId = await appeal()
    const result = await certifyImminentPeril(
      handle.db,
      world.staff,
      { appealId, categories: [], statement: 'Leaning wall', certifiedOn: d('2027-03-06') },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'invalid' })
  })

  it('certification on a resolved appeal is appeal_resolved', async () => {
    const appealId = await appeal()
    await resolveEnforcementAppeal(
      handle.db,
      world.staff,
      { appealId, resolvedOn: d('2027-05-10'), outcome: 'upheld' },
      signal,
      LATER,
    )
    const result = await certifyImminentPeril(
      handle.db,
      world.staff,
      { appealId, categories: ['life'], statement: 'Leaning wall', certifiedOn: d('2027-05-11') },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'appeal_resolved' })
  })

  it('restraining order after certification stays again until dissolved', async () => {
    await readyForMotion()
    const appealId = await appeal()
    await certifyImminentPeril(
      handle.db,
      world.staff,
      { appealId, categories: ['safety'], statement: 'Leaning wall', certifiedOn: d('2027-03-06') },
      signal,
    )
    const restrained = await recordRestrainingOrder(
      handle.db,
      world.staff,
      {
        appealId,
        issuedBy: 'superior_court',
        issuedOn: d('2027-03-08'),
        documentId: await uploadProof(
          handle.db,
          store,
          world.staff,
          order.caseId,
          'Restraining order',
          'court_document',
        ),
      },
      signal,
    )
    if (!restrained.ok) throw new Error(restrained.error)
    const during = await stayFor(handle.db, order.caseId, d('2027-03-09'), signal)
    expect(during).toEqual({ stayed: true, reason: 'restraining_order', appealId })
    expect(await step('filed_with_clerk', '2027-03-10')).toEqual({ ok: false, error: 'stayed' })
    await dissolveRestrainingOrder(
      handle.db,
      world.staff,
      { restrainingOrderId: restrained.value.restrainingOrderId, dissolvedOn: d('2027-03-12') },
      signal,
    )
    expect((await step('filed_with_clerk', '2027-03-13')).ok).toBe(true)
  })

  it('upheld appeal resolved on 2027-05-10 reopens the motion gate', async () => {
    await readyForMotion()
    const appealId = await appeal()
    expect(await step('filed_with_clerk', '2027-05-01')).toEqual({ ok: false, error: 'stayed' })
    const resolved = await resolveEnforcementAppeal(
      handle.db,
      world.staff,
      { appealId, resolvedOn: d('2027-05-10'), outcome: 'upheld' },
      signal,
      LATER,
    )
    expect(resolved.ok).toBe(true)
    expect((await step('filed_with_clerk', '2027-05-11')).ok).toBe(true)
    expect(await step('motion_to_enforce', '2027-05-12')).toEqual({
      ok: false,
      error: { filingLeadUntil: '2027-05-16' },
    })
    expect((await step('motion_to_enforce', '2027-05-16')).ok).toBe(true)
  })

  it('service events still record while stayed and answer dues are not tolled', async () => {
    await appeal('2027-02-27')
    const owner = await listRecipient(
      handle.db,
      world.staff,
      {
        orderId: order.orderId,
        role: 'record_owner',
        name: 'Pat Owner',
        address: '14 Birch Lane',
        source: 'CAMA owner',
      },
      signal,
    )
    if (!owner.ok) throw new Error(owner.error)
    const recorded = await recordServiceEvent(
      handle.db,
      world.staff,
      {
        orderId: order.orderId,
        recipientId: owner.value.recipientId,
        method: 'in_hand',
        servedOn: d('2027-03-01'),
        serverName: 'Sheriff Dale',
        serverRole: 'sheriff',
        proofDocumentId: await uploadProof(handle.db, store, world.staff, order.caseId),
      },
      signal,
      LATER,
    )
    expect(recorded.ok).toBe(true)
    const [row] = await handle.db
      .select()
      .from(orderServiceRecipients)
      .where(eq(orderServiceRecipients.id, owner.value.recipientId))
    expect(row?.answerDue).toMatchObject({ due: '2027-03-22' })
  })

  it('notes still record while stayed', async () => {
    await appeal()
    const note = await addNote(
      handle.db,
      world.staff,
      { caseId: order.caseId, observedOn: d('2027-03-06'), body: 'Photographed the wall.' },
      signal,
    )
    expect(note.ok).toBe(true)
  })

  it('issuing a new order while stayed is stayed', async () => {
    await appeal()
    const finding = await recordFinding(
      handle.db,
      world.staff,
      {
        caseId: order.caseId,
        provisionKind: 'zoning_ordinance',
        provisionRef: 'Zoning Ordinance Section 5.1',
        facts: 'A shed was added.',
        inspectionDate: d('2027-03-06'),
      },
      signal,
      LATER,
    )
    if (!finding.ok) throw new Error(finding.error)
    const drafted = await draftOrder(
      handle.db,
      world.staff,
      {
        caseId: order.caseId,
        findingIds: [finding.value.findingId],
        correctiveAction: 'Remove the shed.',
        correctiveDeadline: d('2027-04-30'),
        ceaseImmediately: false,
      },
      signal,
      LATER,
    )
    if (!drafted.ok) throw new Error(drafted.error)
    const result = await issueOrder(
      handle.db,
      store,
      world.staff,
      { orderId: drafted.value.orderId, issuedOn: d('2027-03-07'), expectedRowVersion: 1 },
      signal,
      LATER,
    )
    expect(result).toEqual({ ok: false, error: 'stayed' })
  })

  it('stay banner cites RSA 676:6 from the pack rule label', async () => {
    const appealId = await appeal('2027-03-05')
    const stay = await stayFor(handle.db, order.caseId, d('2027-03-06'), signal)
    expect(stay).toEqual({ stayed: true, reason: 'appeal_pending', appealId })
    expect(stayBanner(stay, d('2027-03-05'), null)).toBe(
      'Enforcement stayed by appeal to the ZBA filed March 5, 2027 (RSA 676:6).',
    )
  })

  it('the certified banner names the date and the restraining order requirement', () => {
    expect(
      stayBanner({ stayed: false, reason: null, appealId: null }, d('2027-03-05'), d('2027-03-06')),
    ).toBe(
      'Not stayed: the officer certified imminent peril on March 6, 2027. Only a restraining order from the ZBA or the superior court stops these proceedings.',
    )
  })

  it('an appeal against another case order is refused', async () => {
    const other = await issuedOrder(handle.db, store, world, { location: '2 Elm Street' })
    const result = await recordEnforcementAppeal(
      handle.db,
      world.staff,
      {
        caseId: order.caseId,
        targetKind: 'order',
        targetId: other.orderId,
        filedOn: d('2027-03-05'),
        appellantName: 'Pat Owner',
      },
      signal,
      LATER,
    )
    expect(result).toEqual({ ok: false, error: 'target_not_found' })
  })

  it('an appeal that annuls the order marks it annulled and blocks any court step', async () => {
    await readyForMotion()
    const appealId = await appeal()
    await resolveEnforcementAppeal(
      handle.db,
      world.staff,
      { appealId, resolvedOn: d('2027-05-10'), outcome: 'annulled' },
      signal,
      LATER,
    )
    const [row] = await handle.db
      .select()
      .from(enforcementOrders)
      .where(eq(enforcementOrders.id, order.orderId))
    expect(row?.status).toBe('annulled')
    expect(await step('filed_with_clerk', '2027-05-11')).toEqual({
      ok: false,
      error: 'order_not_active',
    })
  })
})
