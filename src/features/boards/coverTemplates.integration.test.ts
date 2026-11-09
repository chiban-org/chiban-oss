import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { packetCoverPdf } from '@/features/boards/cover'
import { openPacket, sendPacketLink } from '@/features/boards/packetLinks'
import { createPacket } from '@/features/boards/packets'
import { setAudiences } from '@/features/documents/publish'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { documentFrame } from '@/features/pdf/documentFrame'
import type { ObjectStore } from '@/features/storage/objectStore'
import { publishedTemplate } from '@/features/templates/findTemplate'
import { BOARD_PACKET_COVER_SOURCE } from '@/features/templates/preview/boardSources'
import { renderDocument } from '@/features/templates/templateBlocks'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'
import { packetMeeting } from '@/test/packetFixtures'
import { staffActor } from '@/test/parcels'
import { pdfText } from '@/test/pdfText'
import { publishWordingTemplate, TOWN_WORDING } from '@/test/wordingTemplate'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let store: ObjectStore
let packetId: string
let token: string

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
  const appRef = {
    kind: 'application' as const,
    id: (await makeApplication(handle.db, world)).applicationId,
  }
  const up = await uploadAs(handle.db, store, world.applicant, appRef, pdfBytes('site plan'), {
    title: 'Site plan',
  })
  await setAudiences(
    handle.db,
    world.staff,
    { documentId: up.documentId, audiences: ['board'] },
    signal,
  )
  const made = await createPacket(
    handle.db,
    world.staff,
    {
      title: 'April meeting packet',
      meetingId: await packetMeeting(handle.db, 'zba', '2027-04-15'),
      documentIds: [up.documentId],
    },
    signal,
  )
  if (!made.ok) throw new Error(JSON.stringify(made.error))
  packetId = made.value.packetId
  const mail = createMemoryTransport()
  const sent = await sendPacketLink(
    handle.db,
    mail,
    world.staff,
    { packetId, recipientName: 'Bea Board', recipientEmail: 'bea@alderpond.example' },
    signal,
  )
  if (!sent.ok) throw new Error(sent.error)
  token = /\/board\/packets\/([A-Za-z0-9_-]+)/.exec(mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
})
afterEach(async () => {
  await handle.drop()
})

async function realText(): Promise<string> {
  const opened = await openPacket(handle.db, token, new Date(), signal)
  if (!opened.ok) throw new Error(JSON.stringify(opened.error))
  const frame = await documentFrame(handle.db, { boardId: opened.value.boardId }, signal)
  const template = await publishedTemplate(handle.db, 'board_packet_cover', signal)
  return await pdfText(await packetCoverPdf(opened.value, frame, template))
}

describe('board packet cover templates', () => {
  it('a published template is used and the packet keeps its own title', async () => {
    await publishWordingTemplate(
      handle.db,
      await staffActor(handle.db, 'admin'),
      'board_packet_cover',
    )
    const text = await realText()
    expect(text).toContain(TOWN_WORDING)
    expect(text).toContain('April meeting packet')
    expect(text).toContain('Site plan')
  })

  it('the preview lists the packet and rebuilds the real cover', async () => {
    const scope = { db: handle.db, actor: world.staff, signal }
    expect(await BOARD_PACKET_COVER_SOURCE.samples(scope)).toEqual([
      { id: packetId, label: 'April meeting packet, meeting April 15, 2027' },
    ])
    const input = await BOARD_PACKET_COVER_SOURCE.input(scope, packetId)
    if (input === null) throw new Error('no preview input')
    const rendered = await renderDocument('board_packet_cover', null, input)
    if (!rendered.ok) throw new Error('render failed')
    expect(await pdfText(rendered.value)).toBe(await realText())
  })
})
