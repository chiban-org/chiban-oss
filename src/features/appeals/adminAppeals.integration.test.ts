import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appealNodes, appeals, auditLog } from '@/db/schema'
import {
  loadAdministrativeAppeals,
  loadApplicationAppeals,
  recordAdministrativeDecision,
} from '@/features/appeals/adminAppeals'
import { addAppealNode } from '@/features/appeals/graph'
import { hasCapability } from '@/features/authz/capabilities'
import { makeApplication } from '@/test/applicationFixtures'
import { BOARD_FIXTURE_NOW, type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function decided(number: string, on = '2027-03-01') {
  const result = await recordAdministrativeDecision(
    handle.db,
    world.staff,
    { applicationNumber: number, occurredOn: d(on), now: BOARD_FIXTURE_NOW },
    signal,
  )
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('recording an administrative decision', () => {
  it('finds the permit by its number, adds the decision and records who added it', async () => {
    const permit = await makeApplication(handle.db, world, { state: 'issued' })
    const { nodeId, applicationId } = await decided(` ${permit.number} `)
    expect(applicationId).toBe(permit.applicationId)
    const [node] = await handle.db.select().from(appealNodes).where(eq(appealNodes.id, nodeId))
    expect(node).toMatchObject({ kind: 'administrative_decision', occurredOn: '2027-03-01' })
    const audits = await handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, nodeId), eq(auditLog.action, 'appeal.node.add')))
    expect(audits).toHaveLength(1)
  })

  it('refuses a number that matches no application', async () => {
    expect(
      await recordAdministrativeDecision(
        handle.db,
        world.staff,
        { applicationNumber: 'BP-1999-0000', occurredOn: d('2027-03-01'), now: BOARD_FIXTURE_NOW },
        signal,
      ),
    ).toEqual({ ok: false, error: 'unknown_application' })
  })

  it('refuses a decision dated after today and a reviewer', async () => {
    const permit = await makeApplication(handle.db, world, { state: 'issued' })
    const input = { applicationNumber: permit.number, now: BOARD_FIXTURE_NOW }
    expect(
      await recordAdministrativeDecision(
        handle.db,
        world.staff,
        { ...input, occurredOn: d('2028-01-04') },
        signal,
      ),
    ).toEqual({ ok: false, error: 'future_date' })
    expect(
      await recordAdministrativeDecision(
        handle.db,
        world.reviewer,
        { ...input, occurredOn: d('2027-03-01') },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('the administrative appeals views', () => {
  it('lists each permit with a decision and whether it was appealed', async () => {
    const quiet = await makeApplication(handle.db, world, { state: 'issued' })
    const appealed = await makeApplication(handle.db, world, { state: 'issued' })
    await decided(quiet.number)
    const root = await decided(appealed.number, '2027-03-05')
    const appeal = await addAppealNode(
      handle.db,
      world.staff,
      {
        parentId: root.nodeId,
        kind: 'zba_appeal',
        occurredOn: d('2027-03-20'),
        appellantName: 'Lee Abbott',
      },
      signal,
      BOARD_FIXTURE_NOW,
    )
    if (!appeal.ok) throw new Error(appeal.error)
    const list = await loadAdministrativeAppeals(handle.db, world.staff, signal)
    expect(list?.map((r) => [r.applicationNumber, r.decidedOnText, r.statusText])).toEqual([
      [appealed.number, 'March 5, 2027', 'Appealed to the Zoning Board on March 20, 2027'],
      [quiet.number, 'March 1, 2027', 'Not appealed. The appeal window ends March 31, 2027.'],
    ])
  })

  it('shows one permit with its appeal window and the steps it can follow', async () => {
    const permit = await makeApplication(handle.db, world, { state: 'issued' })
    const { nodeId } = await decided(permit.number)
    const view = await loadApplicationAppeals(handle.db, world.staff, permit.applicationId, signal)
    expect(view?.applicationNumber).toBe(permit.number)
    expect(view?.graph.map((n) => [n.kindLabel, n.window?.dueText])).toEqual([
      ['Administrative decision', 'March 31, 2027'],
    ])
    expect(view?.nodeChoices).toEqual([
      { id: nodeId, label: 'Administrative decision, March 1, 2027' },
    ])
  })

  it('lets someone who records board actions appeal an issued permit without issuing permits', async () => {
    const permit = await makeApplication(handle.db, world, { state: 'issued' })
    const root = await decided(permit.number, '2027-03-05')
    expect(await hasCapability(handle.db, world.admin.userId, 'permit.issue', signal)).toBe(false)
    const appeal = await addAppealNode(
      handle.db,
      world.admin,
      {
        parentId: root.nodeId,
        kind: 'zba_appeal',
        occurredOn: d('2027-03-20'),
        appellantName: 'Lee Abbott',
      },
      signal,
      BOARD_FIXTURE_NOW,
    )
    expect(appeal.ok, JSON.stringify(appeal)).toBe(true)
    const recorded = await handle.db
      .select({ appellantName: appeals.appellantName, recordedBy: appeals.recordedBy })
      .from(appeals)
      .where(eq(appeals.applicationId, permit.applicationId))
    expect(recorded).toEqual([{ appellantName: 'Lee Abbott', recordedBy: world.admin.userId }])
  })

  it('shows nothing to a reviewer', async () => {
    const permit = await makeApplication(handle.db, world, { state: 'issued' })
    expect(await loadAdministrativeAppeals(handle.db, world.reviewer, signal)).toBeNull()
    expect(
      await loadApplicationAppeals(handle.db, world.reviewer, permit.applicationId, signal),
    ).toBeNull()
  })
})
