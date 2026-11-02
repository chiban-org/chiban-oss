import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enforcementOrders, orderServiceEvents } from '@/db/schema'
import {
  listRecipient,
  loadServiceState,
  recordRoleCheck,
  recordServiceEvent,
} from '@/features/enforcement/service'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type EnforcementWorld,
  type IssuedOrder,
  issuedOrder,
  setupEnforcementWorld,
  uploadProof,
} from '@/test/enforcementFixtures'
import { makeTestStore } from '@/test/minio'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let store: ObjectStore
let world: EnforcementWorld
let order: IssuedOrder

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  world = await setupEnforcementWorld(handle.db)
  order = await issuedOrder(handle.db, store, world)
})
afterEach(async () => {
  await handle.drop()
})

async function addOwner() {
  const added = await listRecipient(
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
  if (!added.ok) throw new Error(added.error)
  return added.value.recipientId
}

async function proof(title = 'Return of service') {
  return await uploadProof(handle.db, store, world.staff, order.caseId, title)
}

describe('service of an order', () => {
  it('service event without proof is proof_required', async () => {
    const recipientId = await addOwner()
    const result = await recordServiceEvent(
      handle.db,
      world.staff,
      {
        orderId: order.orderId,
        recipientId,
        method: 'in_hand',
        servedOn: d('2027-03-01'),
        serverName: 'Sgt. Lee',
        serverRole: 'local_police_officer',
        proofDocumentId: null,
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'proof_required' })
  })

  it('a proof document from another case is proof_required', async () => {
    const recipientId = await addOwner()
    const other = await issuedOrder(handle.db, store, world, { location: '2 Elm Street' })
    const foreign = await uploadProof(handle.db, store, world.staff, other.caseId)
    const result = await recordServiceEvent(
      handle.db,
      world.staff,
      {
        orderId: order.orderId,
        recipientId,
        method: 'in_hand',
        servedOn: d('2027-03-01'),
        serverName: 'Sgt. Lee',
        serverRole: 'local_police_officer',
        proofDocumentId: foreign,
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'proof_required' })
  })

  it('a photo is not a proof of service', async () => {
    const recipientId = await addOwner()
    const photo = await uploadProof(
      handle.db,
      store,
      world.staff,
      order.caseId,
      'Photo',
      'enforcement_photo',
    )
    const result = await recordServiceEvent(
      handle.db,
      world.staff,
      {
        orderId: order.orderId,
        recipientId,
        method: 'in_hand',
        servedOn: d('2027-03-01'),
        serverName: 'Sgt. Lee',
        serverRole: 'local_police_officer',
        proofDocumentId: photo,
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'proof_required' })
  })

  it('publication without an owner_not_found check is fallback_needs_owner_not_found', async () => {
    const result = await recordServiceEvent(
      handle.db,
      world.staff,
      {
        orderId: order.orderId,
        recipientId: null,
        method: 'newspaper_publication',
        servedOn: d('2027-03-04'),
        newspaper: 'Alder Pond Gazette',
        proofDocumentId: await proof('Tear sheet'),
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'fallback_needs_owner_not_found' })
  })

  it('in-hand service without a server role is server_role_required', async () => {
    const recipientId = await addOwner()
    const result = await recordServiceEvent(
      handle.db,
      world.staff,
      {
        orderId: order.orderId,
        recipientId,
        method: 'in_hand',
        servedOn: d('2027-03-01'),
        proofDocumentId: await proof(),
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'server_role_required' })
  })

  it('in-hand service by a private person is server_role_required', async () => {
    const recipientId = await addOwner()
    const result = await recordServiceEvent(
      handle.db,
      world.staff,
      {
        orderId: order.orderId,
        recipientId,
        method: 'in_hand',
        servedOn: d('2027-03-01'),
        serverName: 'A. Friend',
        serverRole: 'other',
        proofDocumentId: await proof(),
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'server_role_required' })
  })

  it('in-hand service by a sheriff with proof records and marks the order served when complete', async () => {
    const recipientId = await addOwner()
    for (const role of ['taxpayer'] as const) {
      await recordRoleCheck(
        handle.db,
        world.staff,
        {
          orderId: order.orderId,
          role,
          outcome: 'same_as_owner',
          basis: 'Tax bill goes to the owner',
          checkedOn: d('2027-02-27'),
        },
        signal,
      )
    }
    for (const role of ['occupying_tenant', 'person_in_control', 'mortgagee_of_record'] as const) {
      const checked = await recordRoleCheck(
        handle.db,
        world.staff,
        {
          orderId: order.orderId,
          role,
          outcome: 'none_exist',
          basis: 'Registry search on file',
          checkedOn: d('2027-02-27'),
        },
        signal,
      )
      if (!checked.ok) throw new Error(checked.error)
    }
    const result = await recordServiceEvent(
      handle.db,
      world.staff,
      {
        orderId: order.orderId,
        recipientId,
        method: 'in_hand',
        servedOn: d('2027-03-01'),
        serverName: 'Sheriff Dale',
        serverRole: 'sheriff',
        proofDocumentId: await proof(),
      },
      signal,
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.value.status.complete).toBe(true)
    const [row] = await handle.db
      .select()
      .from(enforcementOrders)
      .where(eq(enforcementOrders.id, order.orderId))
    expect(row?.status).toBe('served')
    expect(await handle.db.select().from(orderServiceEvents)).toHaveLength(1)
    const state = await loadServiceState(handle.db, order.orderId, signal)
    expect(state.events).toHaveLength(1)
  })

  it('a role check of same_as_owner for a tenant is invalid_outcome', async () => {
    const result = await recordRoleCheck(
      handle.db,
      world.staff,
      {
        orderId: order.orderId,
        role: 'occupying_tenant',
        outcome: 'same_as_owner',
        basis: 'x',
        checkedOn: d('2027-02-27'),
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'invalid_outcome' })
  })

  it('owner_not_found is only valid for the record owner', async () => {
    const result = await recordRoleCheck(
      handle.db,
      world.staff,
      {
        orderId: order.orderId,
        role: 'mortgagee_of_record',
        outcome: 'owner_not_found',
        basis: 'x',
        checkedOn: d('2027-02-27'),
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'invalid_outcome' })
  })

  it('a role check can be revised and keeps one row per role', async () => {
    for (const outcome of ['none_exist', 'recipients_listed'] as const) {
      const r = await recordRoleCheck(
        handle.db,
        world.staff,
        {
          orderId: order.orderId,
          role: 'occupying_tenant',
          outcome,
          basis: 'Walked the property',
          checkedOn: d('2027-02-27'),
        },
        signal,
      )
      expect(r.ok).toBe(true)
    }
    const state = await loadServiceState(handle.db, order.orderId, signal)
    expect(state.checks.filter((c) => c.role === 'occupying_tenant')).toEqual([
      { role: 'occupying_tenant', outcome: 'recipients_listed' },
    ])
  })

  it('a reviewer cannot record service', async () => {
    const reviewer = await staffActor(handle.db, 'reviewer')
    const result = await listRecipient(
      handle.db,
      reviewer,
      { orderId: order.orderId, role: 'record_owner', name: 'x', address: 'y', source: 'z' },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })

  it('a draft order cannot be served', async () => {
    const draft = await issuedOrder(handle.db, store, world, {
      location: '9 Draft Road',
      skipDesignation: true,
    })
    const result = await listRecipient(
      handle.db,
      world.staff,
      { orderId: draft.orderId, role: 'record_owner', name: 'x', address: 'y', source: 'z' },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'order_not_issued' })
  })
})
