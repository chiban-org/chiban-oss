import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveTownParties } from '@/features/abutters/townParties'
import type { IncompleteReason } from '@/features/abutters/types'
import { boardForKind } from '@/features/boards/townBoards'
import { TOWN_PROFILE_SKELETON } from '@/features/town/profileSchema'
import { type BoardWorld, setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

let handle: TestDb
let world: BoardWorld
let applicationId: string

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  applicationId = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
})
afterEach(async () => {
  await handle.drop()
})

function context() {
  const incomplete: IncompleteReason[] = []
  return {
    ctx: {
      tx: handle.db,
      input: { applicationId },
      signal: new AbortController().signal,
      incomplete,
    },
    incomplete,
  }
}

async function publishProfile(addressLines: string[]) {
  await saveAndPublish(handle.db, world.admin, 'town_profile', 'default', {
    ...TOWN_PROFILE_SKELETON,
    addressLines,
  })
}

describe('resolveTownParties', () => {
  it('resolves the planning board and the municipal officers at the town office address', async () => {
    await publishProfile(['2 Common Road', 'Fernhollow, ME 04000'])
    const board = await boardForKind(handle.db, 'planning_board', new AbortController().signal)
    const { ctx, incomplete } = context()
    const out = await resolveTownParties(ctx, ['planning_board', 'municipal_officers'])
    expect(incomplete).toEqual([])
    expect(
      out.map((r) => ({
        roles: r.roles,
        name: r.name,
        mailingAddress: r.mailingAddress,
        key: r.key,
        status: r.status,
      })),
    ).toEqual([
      {
        roles: ['planning_board'],
        name: board?.name,
        mailingAddress: '2 Common Road, Fernhollow, ME 04000',
        key: '',
        status: 'ok',
      },
      {
        roles: ['municipal_officers'],
        name: 'Selectmen',
        mailingAddress: '2 Common Road, Fernhollow, ME 04000',
        key: '',
        status: 'ok',
      },
    ])
  })

  it('returns only the requested roles', async () => {
    await publishProfile(['2 Common Road'])
    const { ctx } = context()
    const out = await resolveTownParties(ctx, ['municipal_officers'])
    expect(out.map((r) => r.roles)).toEqual([['municipal_officers']])
  })

  it('reports incomplete for each role when the town profile is not published', async () => {
    const { ctx, incomplete } = context()
    const out = await resolveTownParties(ctx, ['planning_board', 'municipal_officers'])
    expect(out).toEqual([])
    expect(incomplete).toEqual([
      {
        code: 'regional_contacts_missing',
        detail: 'Add the town office mailing address under Settings, Town profile.',
        role: 'planning_board',
      },
      {
        code: 'regional_contacts_missing',
        detail: 'Add the town office mailing address under Settings, Town profile.',
        role: 'municipal_officers',
      },
    ])
  })
})
