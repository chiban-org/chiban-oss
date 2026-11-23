import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  decisionDocumentInput,
  generateDecisionDocuments,
} from '@/features/decisions/decisionDocuments'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ObjectStore } from '@/features/storage/objectStore'
import { NOT_RECORDED } from '@/features/templates/renderTemplate'
import { publishTownProfileSection } from '@/features/town/profileSettings'
import { type BoardWorld, boardTypeBody, setupBoardWorld } from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  BOA_MEETINGS,
  BOA_VARIANCE_TYPE,
  decidedBoa,
  publishBoardOfAppealsTypes,
} from '@/test/maineBoardOfAppealsFixtures'
import {
  acceptAtMeeting,
  decideSubdivision,
  publishSubdivisionType,
  receivedSubdivision,
  SUBDIVISION_TYPE,
} from '@/test/maineSubdivisionFixtures'
import { downloadObject } from '@/test/objectBytes'
import { makeTestStore } from '@/test/objectStore'
import { pdfWording } from '@/test/pdfWording'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const CHAIR_LINE = 'Rowan Quill, Chair, Board of Appeals'
let handle: TestDb
let world: BoardWorld
let store: ObjectStore

async function publishStarterTemplates(
  starterId: string,
  classification: 'me.boa_variance' | 'me.pb_subdivision',
  typeKey: string,
) {
  const starter = ME_PACK.starters.find((s) => s.id === starterId)
  if (starter === undefined) throw new Error(`no starter ${starterId}`)
  for (const template of starter.templates) {
    await saveAndPublish(handle.db, world.admin, 'template', template.key, template)
  }
  await saveAndPublish(
    handle.db,
    world.admin,
    'application_type',
    typeKey,
    boardTypeBody(
      classification,
      typeKey,
      typeKey,
      { templateKeys: starter.templates.map((t) => t.key) },
      ME_PACK,
    ),
  )
}

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: BOA_MEETINGS })
  store = (await makeTestStore()).store
  setActivePackForTest(ME_PACK)
  await publishBoardOfAppealsTypes(handle.db, world)
  await publishSubdivisionType(handle.db, world)
  await publishStarterTemplates('me.starter.boa_variance', 'me.boa_variance', BOA_VARIANCE_TYPE)
  await publishStarterTemplates('me.starter.pb_subdivision', 'me.pb_subdivision', SUBDIVISION_TYPE)
  const signers = await publishTownProfileSection(
    handle.db,
    world.admin,
    {
      section: 'signers',
      slice: {
        signers: [
          {
            role: 'zba_chair',
            name: 'Rowan Quill',
            title: 'Chair, Board of Appeals',
            signature: null,
          },
        ],
      },
    },
    signal,
  )
  if (!signers.ok) throw new Error(JSON.stringify(signers.error))
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

function flat(text: string): string {
  return text.replace(/\s+/g, ' ')
}

async function appealRightsOf(decisionId: string) {
  const loaded = await decisionDocumentInput(handle.db, decisionId, signal)
  if (!loaded.ok) throw new Error(loaded.error)
  const { values, locked } = loaded.value.input.context
  const merged = (values as Record<string, string | null>)['decision.appealRights'] ?? ''
  expect(locked?.get('decision.appealRights')).toBe(merged)
  return merged
}

async function noticeWording(decisionId: string) {
  const made = await generateDecisionDocuments(handle.db, store, world.staff, decisionId, signal)
  if (!made.ok) throw new Error(made.error)
  return flat(
    await pdfWording(await downloadObject(handle.db, store, made.value.noticeOfDecisionId)),
  )
}

describe('Maine decision documents state the appeal windows', () => {
  it('a Board of Appeals denial states the reconsideration and court windows', async () => {
    const made = await decidedBoa(handle.db, world, { outcome: 'denied' })
    const rights = await appealRightsOf(made.decisionId)
    expect(rights).toContain('reconsider its decision: within 10 days after the vote')
    expect(rights).toContain('Board of Appeals decision: within 45 days after the vote')
    expect(rights).toContain('within 15 days after the decision on reconsideration')
    expect(rights).toContain('If reconsideration refused:')
    expect(rights).not.toContain('last municipal approval')
    const notice = await noticeWording(made.decisionId)
    for (const sentence of rights.split(/(?<=\)\.)\s/)) expect(notice).toContain(sentence)
    const tail = notice.slice(notice.indexOf(rights.slice(0, 40)))
    expect(tail).not.toContain(NOT_RECORDED)
    expect(tail).toContain(`${rights.split(' ').slice(-3).join(' ')} ${CHAIR_LINE}`)
  })

  it('a Planning Board approval that is not last waits for the last municipal approval', async () => {
    const id = await receivedSubdivision(handle.db, world, 'not_within')
    await acceptAtMeeting(handle.db, world, id)
    const decided = await decideSubdivision(handle.db, world, id, null)
    if (!decided.ok) throw new Error(JSON.stringify(decided.error))
    const rights = await appealRightsOf(decided.value.decisionId)
    expect(rights).toContain('Court appeal of an approval: within 30 days')
    expect(rights).toContain('last municipal approval')
    const notice = await noticeWording(decided.value.decisionId)
    expect(notice).toContain('after the project has its last municipal approval')
  })
})
