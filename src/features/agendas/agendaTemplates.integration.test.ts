import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildAgenda, publishAgenda } from '@/features/agendas/agendas'
import { scheduleHearing } from '@/features/hearings/hearings'
import type { ObjectStore } from '@/features/storage/objectStore'
import { AGENDA_SOURCE } from '@/features/templates/preview/boardSources'
import { renderDocument } from '@/features/templates/templateBlocks'
import {
  type BoardWorld,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'
import { issueListWithRecipients, recipient } from '@/test/noticeFixtures'
import { downloadObject } from '@/test/objectBytes'
import { pdfText } from '@/test/pdfText'
import { publishWordingTemplate, TOWN_WORDING } from '@/test/wordingTemplate'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let store: ObjectStore
let meetingId: string

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
  store = (await makeTestStore()).store
  const rows = await handle.db.query.boardMeetings.findMany({
    where: (m, { and, eq: equals }) =>
      and(equals(m.meetingDate, '2027-04-15'), equals(m.board, 'zba')),
  })
  meetingId = rows[0]?.id ?? ''
  const applicationId = await submitBoardApplication(
    handle.db,
    world,
    world.zbaTypeKey,
    '2027-03-02',
  )
  await recordNoRegionalImpact(handle.db, world, applicationId)
  await issueListWithRecipients(handle.db, world, applicationId, [recipient(1)])
  const hearing = await scheduleHearing(
    handle.db,
    world.staff,
    { applicationId, meetingId, kind: 'public_hearing' },
    signal,
  )
  if (!hearing.ok) throw new Error(JSON.stringify(hearing.error))
  await buildAgenda(handle.db, world.staff, meetingId, signal)
})
afterEach(async () => {
  await handle.drop()
})

async function publishedText(): Promise<string> {
  const published = await publishAgenda(handle.db, store, world.staff, meetingId, signal)
  if (!published.ok) throw new Error(published.error)
  return await pdfText(await downloadObject(handle.db, store, published.value.documentId))
}

describe('agenda templates', () => {
  it('a published template is used for the published agenda', async () => {
    await publishWordingTemplate(handle.db, world.admin, 'agenda')
    const text = await publishedText()
    expect(text).toContain(TOWN_WORDING)
    expect(text).toContain('Zoning Board of Adjustment')
  })

  it('the preview lists meetings with agenda items and rebuilds the real agenda', async () => {
    const scope = { db: handle.db, actor: world.staff, signal }
    const samples = await AGENDA_SOURCE.samples(scope)
    expect(samples).toEqual([
      { id: meetingId, label: 'Alder Pond Zoning Board of Adjustment, April 15, 2027' },
    ])
    const input = await AGENDA_SOURCE.input(scope, meetingId)
    if (input === null) throw new Error('no preview input')
    const rendered = await renderDocument('agenda', null, input)
    if (!rendered.ok) throw new Error('render failed')
    expect(await pdfText(rendered.value)).toBe(await publishedText())
  })

  it('an unknown meeting has no preview', async () => {
    const scope = { db: handle.db, actor: world.staff, signal }
    expect(await AGENDA_SOURCE.input(scope, randomUUID())).toBeNull()
  })
})
