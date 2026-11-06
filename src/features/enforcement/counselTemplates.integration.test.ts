import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { referToCounsel } from '@/features/enforcement/counsel'
import { buildCounselPacket } from '@/features/enforcement/counselPacket'
import type { ObjectStore } from '@/features/storage/objectStore'
import { COUNSEL_PACKET_COVER_SOURCE } from '@/features/templates/preview/extraSources'
import { renderDocument } from '@/features/templates/templateBlocks'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  completeService,
  type EnforcementWorld,
  type IssuedOrder,
  issuedOrder,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import { downloadObject } from '@/test/objectBytes'
import { makeTestStore } from '@/test/objectStore'
import { pdfText } from '@/test/pdfText'
import { publishWordingTemplate, TOWN_WORDING } from '@/test/wordingTemplate'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-07-20T15:00:00Z')
const REFERRED = '2027-07-20' as CivilDate
let handle: TestDb
let store: ObjectStore
let world: EnforcementWorld
let order: IssuedOrder

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  world = await setupEnforcementWorld(handle.db)
  order = await issuedOrder(handle.db, store, world)
  await completeService(handle.db, store, world, order, '2027-03-01')
})
afterEach(async () => {
  vi.useRealTimers()
  await handle.drop()
})

async function refer() {
  const referred = await referToCounsel(
    handle.db,
    store,
    world.staff,
    {
      caseId: order.caseId,
      counselName: 'Attorney Rivera',
      purpose: 'motion_to_enforce',
      referredOn: REFERRED,
    },
    signal,
    NOW,
  )
  if (!referred.ok) throw new Error(referred.error)
  return referred.value
}

describe('counsel packet templates', () => {
  it('a published template is used for the stored packet', async () => {
    await publishWordingTemplate(handle.db, world.admin, 'counsel_packet_cover')
    const { packetDocumentId } = await refer()
    const text = await pdfText(await downloadObject(handle.db, store, packetDocumentId))
    expect(text).toContain(TOWN_WORDING)
    expect(text).toContain('EC-2027-0001')
  })

  it('the preview lists the referral and rebuilds the real packet', async () => {
    const { packetDocumentId } = await refer()
    const scope = { db: handle.db, actor: world.staff, signal }
    const samples = await COUNSEL_PACKET_COVER_SOURCE.samples(scope)
    expect(samples).toHaveLength(1)
    expect(samples[0]?.label).toBe('EC-2027-0001, 14 Birch Lane, referred July 20, 2027')
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
    const input = await COUNSEL_PACKET_COVER_SOURCE.input(scope, samples[0]?.id ?? '')
    vi.useRealTimers()
    if (input === null) throw new Error('no preview input')
    const rendered = await renderDocument('counsel_packet_cover', null, input)
    if (!rendered.ok) throw new Error('render failed')
    const real = await buildCounselPacket(handle.db, order.caseId, REFERRED, NOW, signal)
    expect(await pdfText(rendered.value)).toBe(await pdfText(real))
    expect(await pdfText(rendered.value)).toBe(
      await pdfText(await downloadObject(handle.db, store, packetDocumentId)),
    )
  })
})
