import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { documents } from '@/db/schema'
import { packetCoverInput } from '@/features/boards/cover'
import { packetCoverPreview } from '@/features/boards/packetCoverPreview'
import { createPacket } from '@/features/boards/packets'
import type { DocumentFrame } from '@/features/pdf/frame'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'
import { applicationDocument, type PacketFlow, packetFlow } from '@/test/packetFlowFixtures'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let flow: PacketFlow

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  flow = await packetFlow(handle.db, store)
})
afterEach(async () => {
  await handle.drop()
})

async function generalDocument(title: string): Promise<string> {
  const other = await makeApplication(handle.db, flow.world)
  const up = await uploadAs(
    handle.db,
    store,
    flow.world.staff,
    { kind: 'application', id: other.applicationId },
    pdfBytes(`${title} ${Math.random()}`),
    { title },
  )
  await handle.db
    .update(documents)
    .set({ audiences: ['board'] })
    .where(eq(documents.id, up.documentId))
  return up.documentId
}

describe('the staff packet cover preview', () => {
  it('lists the case documents in agenda order before the rest', async () => {
    const general = await generalDocument('Vellmora road agreement')
    const caseDocument = await applicationDocument(handle.db, store, flow, {
      title: 'Fernhollow setback plan',
      audiences: ['board'],
    })
    const made = await createPacket(
      handle.db,
      flow.world.staff,
      { title: 'April packet', meetingId: flow.meetingId, documentIds: [general, caseDocument] },
      signal,
    )
    expect(made.ok).toBe(true)
    const view = await packetCoverPreview(handle.db, flow.world.staff, flow.meetingId, signal)
    if (!view.ok) throw new Error(view.error)
    const contents = packetCoverInput(view.value, {} as DocumentFrame).context.sections?.get(
      'packet.contents',
    )?.[0]
    expect(contents).toMatchObject({
      rows: [
        ['1', 'Fernhollow setback plan'],
        ['2', 'Vellmora road agreement'],
      ],
    })
  })
})
