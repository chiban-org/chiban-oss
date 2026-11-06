import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadActor } from '@/features/auth/actor'
import { censusBpsReport } from '@/features/census/bpsReport'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { townToday } from '@/features/town/today'
import { makeTestDb, type TestDb } from '@/test/db'
import { civilYear } from '@/types/civilDate'

const signal = new AbortController().signal
const DEPS = { records: { mail: createMemoryTransport() }, screenStates: true }
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedDemo(handle.db, signal, DEPS)
})
afterAll(async () => {
  await handle.drop()
})

async function queue(): Promise<string[]> {
  const staff = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, 'staff@alderpond.example'),
  })
  const actor = await loadActor(handle.db, staff?.id ?? '', signal)
  if (actor === null) throw new Error('staff actor missing')
  const today = await townToday(handle.db, new Date(), signal)
  const report = await censusBpsReport(
    handle.db,
    actor,
    { year: civilYear(today), month: null },
    signal,
  )
  if (!report.ok) throw new Error(report.error)
  return report.value.needsClassification.map((p) => p.number)
}

describe('seeded Census classification queue', () => {
  it('holds one issued building permit awaiting classification, and still one after a second seed', async () => {
    expect(await queue()).toHaveLength(1)
    await seedDemo(handle.db, signal, DEPS)
    expect(await queue()).toHaveLength(1)
  })
})
