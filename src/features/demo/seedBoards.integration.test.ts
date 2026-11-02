import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { abutterLists, applications, completenessVotes, selectmenCertifications } from '@/db/schema'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
})
afterAll(async () => {
  await handle.drop()
})

describe('board demo data', () => {
  it('seeds seven board applications in the states the story needs', async () => {
    const rows = await handle.db.select().from(applications)
    const board = rows.filter((a) => ['SPR', 'MSP', 'VAR'].some((p) => a.number.startsWith(p)))
    expect(board.map((a) => [a.number.split('-')[0], a.state]).sort()).toEqual([
      ['MSP', 'under_review'],
      ['SPR', 'decided'],
      ['SPR', 'submitted'],
      ['VAR', 'decided'],
      ['VAR', 'denied'],
      ['VAR', 'submitted'],
      ['VAR', 'under_review'],
    ])
  })

  it('has an issued list, a draft list with an undecided tenant, and one vote and certification', async () => {
    const lists = await handle.db.select().from(abutterLists)
    expect(lists.filter((l) => l.status === 'issued')).toHaveLength(6)
    expect(lists.filter((l) => l.status === 'draft')).toHaveLength(1)
    expect(await handle.db.select().from(completenessVotes)).toHaveLength(3)
    expect((await handle.db.select().from(selectmenCertifications))[0]?.outcome).toBe('pending')
  })
})
