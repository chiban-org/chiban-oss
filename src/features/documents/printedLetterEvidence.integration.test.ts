import { ME_PACK } from '@packs/me'
import { asc } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { documents } from '@/db/schema'
import { adoptStarter } from '@/features/config/adoptStarter'
import { evidenceOf, isPrintedLetter } from '@/features/documents/evidence'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ObjectStore } from '@/features/storage/objectStore'
import { printLetter } from '@/features/templates/printLetter'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let world: PermitWorld
let store: ObjectStore
let sign: string

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
  setActivePackForTest(ME_PACK)
  const adopted = await adoptStarter(handle.db, world.admin, 'me.starter.sign', signal)
  expect(adopted.ok ? 'ok' : adopted.error).toBe('ok')
  sign = (await makeApplication(handle.db, world, { state: 'denied' }, NOW, 'SG')).applicationId
})
beforeEach(() => {
  setActivePackForTest(ME_PACK)
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('a printed letter is not evidence', () => {
  it('is left out of the documents offered as minutes or proof, while an upload stays in', async () => {
    const upload = await uploadAs(
      handle.db,
      store,
      world.staff,
      { kind: 'application', id: sign },
      pdfBytes('mailing receipt'),
      { title: 'Mailing receipt' },
    )
    const printed = await printLetter(
      handle.db,
      world.staff,
      { applicationId: sign, templateKey: 'sg-denial' },
      store,
      signal,
    )
    if (!printed.ok) throw new Error(printed.error)
    const offered = (
      await handle.db
        .select({ id: documents.id })
        .from(documents)
        .where(evidenceOf(sign))
        .orderBy(asc(documents.seq))
    ).map((d) => d.id)
    expect(offered).toContain(upload.documentId)
    expect(offered).not.toContain(printed.value.documentId)
    expect(await isPrintedLetter(handle.db, printed.value.documentId)).toBe(true)
    expect(await isPrintedLetter(handle.db, upload.documentId)).toBe(false)
  })
})
