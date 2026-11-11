import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appealNodes, appeals, applications } from '@/db/schema'
import { recordAdministrativeDecision } from '@/features/appeals/adminAppeals'
import { addAppealNode } from '@/features/appeals/graph'
import { makeApplication } from '@/test/applicationFixtures'
import { BOARD_FIXTURE_NOW, type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const failing = vi.hoisted(() => ({ action: null as string | null }))

vi.mock('@/features/audit/writeAudit', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/features/audit/writeAudit')>()
  return {
    ...real,
    writeAudit: async (...args: Parameters<typeof real.writeAudit>) => {
      if (args[1].action === failing.action) throw new Error('audit unavailable')
      return await real.writeAudit(...args)
    },
  }
})

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  failing.action = null
})
afterEach(async () => {
  await handle.drop()
})

describe('appealing an issued permit to the Zoning Board', () => {
  it('leaves the permit issued with no appeal when the appeal step fails to save', async () => {
    const permit = await makeApplication(handle.db, world, { state: 'issued' })
    const root = await recordAdministrativeDecision(
      handle.db,
      world.staff,
      { applicationNumber: permit.number, occurredOn: d('2027-03-05'), now: BOARD_FIXTURE_NOW },
      signal,
    )
    if (!root.ok) throw new Error(root.error)
    failing.action = 'appeal.node.add'
    await expect(
      addAppealNode(
        handle.db,
        world.staff,
        {
          parentId: root.value.nodeId,
          kind: 'zba_appeal',
          occurredOn: d('2027-03-20'),
          appellantName: 'Lee Abbott',
        },
        signal,
        BOARD_FIXTURE_NOW,
      ),
    ).rejects.toThrow('audit unavailable')
    const [app] = await handle.db
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.id, permit.applicationId))
    expect(app?.state).toBe('issued')
    expect(
      await handle.db.select().from(appeals).where(eq(appeals.applicationId, permit.applicationId)),
    ).toEqual([])
    expect(
      await handle.db
        .select({ kind: appealNodes.kind })
        .from(appealNodes)
        .where(eq(appealNodes.applicationId, permit.applicationId)),
    ).toEqual([{ kind: 'administrative_decision' }])
  })
})
