import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { logRequest } from '@/features/rtk/requests'
import { buildResponseLetter } from '@/features/rtk/responseLetter'
import { RTK_RESPONSE_SOURCE } from '@/features/templates/preview/officeSources'
import { renderDocument } from '@/features/templates/templateBlocks'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { pdfText } from '@/test/pdfText'
import { publishWordingTemplate, TOWN_WORDING } from '@/test/wordingTemplate'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-07-14T15:00:00Z')
let handle: TestDb
let custodian: Actor
let requestId: string

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
  const logged = await logRequest(
    handle.db,
    custodian,
    {
      receivedOn: '2027-07-02',
      receivedVia: 'email',
      requesterName: 'Jordan Reyes',
      requesterContact: 'jordan@example.test',
      description: 'The Birch Lane owner letters',
    },
    signal,
    NOW,
  )
  if (!logged.ok) throw new Error(logged.error)
  requestId = logged.value.requestId
})
afterEach(async () => {
  await handle.drop()
})

describe('right-to-know response templates', () => {
  it('a published template of the kind is used', async () => {
    await publishWordingTemplate(handle.db, await staffActor(handle.db, 'admin'), 'rtk_response')
    const text = await pdfText(await buildResponseLetter(handle.db, requestId, signal))
    expect(text).toContain(TOWN_WORDING)
    expect(text).toContain('The Birch Lane owner letters')
  })

  it('the preview lists the request and rebuilds the real letter', async () => {
    const scope = { db: handle.db, actor: custodian, signal }
    const samples = await RTK_RESPONSE_SOURCE.samples(scope)
    expect(samples).toEqual([{ id: requestId, label: 'RK-2027-0001, received July 2, 2027' }])
    const input = await RTK_RESPONSE_SOURCE.input(scope, requestId)
    if (input === null) throw new Error('no preview input')
    const rendered = await renderDocument('rtk_response', null, input)
    if (!rendered.ok) throw new Error('render failed')
    expect(await pdfText(rendered.value)).toBe(
      await pdfText(await buildResponseLetter(handle.db, requestId, signal)),
    )
  })
})
