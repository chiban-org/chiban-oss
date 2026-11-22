import { ME_PACK } from '@packs/me'
import { NH_PACK } from '@packs/nh'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appealNodes, applications, documents } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import {
  decideStaffApplication,
  STAFF_DECISION_LETTER_TITLE,
} from '@/features/applications/staffDecision'
import type { Actor } from '@/features/auth/actor'
import { adoptStarter } from '@/features/config/adoptStarter'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { overrideAdministrativeGate, recordStatutoryException } from '@/features/gates/overrides'
import { issueApplication } from '@/features/issuance/issueApplication'
import { setActivePackForTest } from '@/features/packs/registry'
import type { StatePack } from '@/features/packs/schema'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { staffActor } from '@/test/parcels'
import { signedOffReview } from '@/test/reviewFixtures'
import { staffWith } from '@/test/staffUsers'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-03-10T16:00:00Z')
let handle: TestDb
let world: PermitWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function adopted(pack: StatePack, starterId: string): Promise<string> {
  setActivePackForTest(pack)
  const starter = pack.starters.find((s) => s.id === starterId)
  if (starter === undefined) throw new Error(`no starter ${starterId}`)
  const done = await adoptStarter(handle.db, world.admin, starterId, signal)
  if (!done.ok) throw new Error(JSON.stringify(done.error))
  return starter.applicationType.key
}

async function clearGates(applicationId: string, to: 'issued' | 'decided') {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  if (app === null) throw new Error('no application')
  const results = await handle.db.transaction((tx) =>
    evaluateGates(tx, app, to, '2027-03-10' as CivilDate, signal),
  )
  const admin = await staffActor(handle.db, 'admin')
  for (const gate of results.filter((g) => g.effective === 'blocked')) {
    const done =
      gate.kind === 'administrative'
        ? await overrideAdministrativeGate(
            handle.db,
            world.staff,
            { applicationId, gateKey: gate.key, reason: 'Cleared for this test.' },
            signal,
          )
        : await recordStatutoryException(
            handle.db,
            admin,
            {
              applicationId,
              gateKey: gate.key,
              legalAuthority: { citation: 'Town rule 1', explanation: 'Cleared for this test.' },
            },
            signal,
          )
    expect(done).toEqual({ ok: true, value: undefined })
  }
}

async function issued(applicationId: string, issuer: Actor = world.staff) {
  await clearGates(applicationId, 'issued')
  const result = await issueApplication(handle.db, issuer, { applicationId }, signal, {
    store,
    now: NOW,
  })
  if (!result.ok) throw new Error(JSON.stringify(result.error))
}

async function registerOf(applicationId: string) {
  const [app] = await handle.db
    .select({ issuedOn: applications.issuedOn })
    .from(applications)
    .where(eq(applications.id, applicationId))
  const nodes = await handle.db
    .select({ kind: appealNodes.kind, outcome: appealNodes.outcome, on: appealNodes.occurredOn })
    .from(appealNodes)
    .where(eq(appealNodes.applicationId, applicationId))
  const letters = await handle.db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(eq(documents.recordId, applicationId), eq(documents.title, STAFF_DECISION_LETTER_TITLE)),
    )
  return { issuedOn: app?.issuedOn ?? null, nodes, letters: letters.length }
}

describe('a permit issued straight from submitted', () => {
  for (const [pack, starterId, roles] of [
    [NH_PACK, 'nh.starter.electrical', ['staff']],
    [ME_PACK, 'me.starter.internal_plumbing', ['plumbing_inspector']],
  ] as const) {
    it(`${starterId} enters the Appeals register on the issuance date, with no letter`, async () => {
      const typeKey = await adopted(pack, starterId)
      const { applicationId } = await makeApplication(
        handle.db,
        world,
        { state: 'submitted' },
        NOW,
        typeKey,
      )
      await issued(applicationId, await staffWith(handle.db, [...roles]))
      const register = await registerOf(applicationId)
      expect(register.issuedOn).not.toBeNull()
      expect(register.nodes).toEqual([
        { kind: 'administrative_decision', outcome: 'approved', on: register.issuedOn },
      ])
      expect(register.letters).toBe(0)
    })
  }
})

describe('a permit approved and then issued', () => {
  it('stays on the Appeals register once', async () => {
    const { applicationId } = await makeApplication(
      handle.db,
      world,
      { state: 'under_review' },
      NOW,
    )
    await signedOffReview(handle.db, world, applicationId, signal)
    await clearGates(applicationId, 'decided')
    const [row] = await handle.db
      .select({ rowVersion: applications.rowVersion })
      .from(applications)
      .where(eq(applications.id, applicationId))
    const decided = await decideStaffApplication(
      handle.db,
      world.staff,
      {
        applicationId,
        outcome: 'decided',
        reason: null,
        decidedOn: '2027-03-09' as CivilDate,
        expectedRowVersion: row?.rowVersion ?? 1,
      },
      store,
      signal,
    )
    expect(decided.ok).toBe(true)
    await issued(applicationId)
    const register = await registerOf(applicationId)
    expect(register.nodes).toEqual([
      { kind: 'administrative_decision', outcome: 'approved', on: '2027-03-09' },
    ])
    expect(register.letters).toBe(1)
  })
})
