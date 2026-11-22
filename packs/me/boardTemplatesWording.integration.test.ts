import { ME_PACK } from '@packs/me'
import { ME_STARTERS } from '@packs/me/starters'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateDecisionDocuments } from '@/features/decisions/decisionDocuments'
import { renderNoticeLetters } from '@/features/hearings/noticeLetters'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ObjectStore } from '@/features/storage/objectStore'
import { renderTemplateText } from '@/features/templates/renderTemplate'
import { publishTownProfileSection } from '@/features/town/profileSettings'
import { type BoardWorld, boardTypeBody, setupBoardWorld } from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { BOA_MEETINGS, decidedBoa, scheduledBoaHearing } from '@/test/maineBoardOfAppealsFixtures'
import { downloadObject } from '@/test/objectBytes'
import { makeTestStore } from '@/test/objectStore'
import { pdfWording } from '@/test/pdfWording'

const signal = new AbortController().signal
const TYPE_KEY = 'BOA'
let handle: TestDb
let world: BoardWorld
let store: ObjectStore

function starter(prefix: string) {
  const found = ME_STARTERS.find((s) => s.applicationType.prefix === prefix)
  if (found === undefined) throw new Error(`no ${prefix} starter`)
  return found
}

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: BOA_MEETINGS })
  setActivePackForTest(ME_PACK)
  store = (await makeTestStore()).store
  const variance = starter('VAR')
  for (const template of variance.templates) {
    await saveAndPublish(handle.db, world.admin, 'template', template.key, template)
  }
  await saveAndPublish(
    handle.db,
    world.admin,
    'application_type',
    TYPE_KEY,
    boardTypeBody(
      'me.boa_variance',
      TYPE_KEY,
      TYPE_KEY,
      { templateKeys: variance.templates.map((t) => t.key) },
      ME_PACK,
    ),
  )
  const published = await publishTownProfileSection(
    handle.db,
    world.admin,
    {
      section: 'signers',
      slice: {
        signers: [
          {
            role: 'zba_chair',
            name: 'Drew Hale',
            title: 'Chair, Board of Appeals',
            signature: null,
          },
        ],
      },
    },
    signal,
  )
  if (!published.ok) throw new Error(JSON.stringify(published.error))
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function noticeWording(): Promise<string> {
  const hearing = await scheduledBoaHearing(handle.db, world, TYPE_KEY)
  const rendered = await renderNoticeLetters(handle.db, world.staff, hearing.noticeSetId, signal)
  if (!rendered.ok) throw new Error(rendered.error)
  return await pdfWording(rendered.value)
}

async function decisionWording() {
  const decided = await decidedBoa(handle.db, world, { typeKey: TYPE_KEY })
  const made = await generateDecisionDocuments(
    handle.db,
    store,
    world.staff,
    decided.decisionId,
    signal,
  )
  if (!made.ok) throw new Error(made.error)
  return {
    notice: await pdfWording(await downloadObject(handle.db, store, made.value.noticeOfDecisionId)),
    letter: await pdfWording(await downloadObject(handle.db, store, made.value.letterId)),
  }
}

describe('Maine permit wording', () => {
  it('the building permit prints the description of the work and not the generated project title', () => {
    const permit = starter('BP').templates.find((t) => t.kind === 'permit')
    if (permit === undefined || !('body' in permit)) throw new Error('no building permit text')
    const rendered = renderTemplateText(permit.body, {
      'application.description': 'Build a rear deck on the existing dwelling.',
      'project.title': 'Building permit, 14 Lantern Row',
      'parcel.siteAddress': '14 Lantern Row',
    })
    if (!rendered.ok) throw new Error('unknown fields')
    expect(rendered.value).toContain('Work: Build a rear deck on the existing dwelling.')
    expect(rendered.value).not.toContain('Building permit, 14 Lantern Row')
  })
})

describe('Maine hearing notice wording', () => {
  it('reads as a public hearing, carries the date of the notice and does not repeat the address', async () => {
    const text = await noticeWording()
    expect(text).toContain('Notice of public hearing')
    expect(text).toContain('will hold a public hearing on')
    expect(text).toMatch(/Date of this notice: [A-Z][a-z]+ \d{1,2}, \d{4}/)
    expect(text).not.toContain('Public hearing')
    expect(text).not.toContain('You are receiving this notice as')
    expect(text).toContain('This notice is mailed to the owners of abutting property')
    expect(text).not.toMatch(/, Not recorded, parcel/)
  })
})

describe('Maine decision wording', () => {
  it('the notice of decision and decision letter end with the board chair', async () => {
    const { notice, letter } = await decisionWording()
    for (const text of [notice, letter]) {
      expect(
        text
          .split('\n')
          .filter((l) => l !== '')
          .slice(-2)[0],
      ).toBe('Drew Hale, Chair, Board of Appeals')
      expect(text).not.toContain('Garage addition')
    }
  })

  it('every board starter keeps the appeal rights field before its chair line', () => {
    const chairByPrefix = { VAR: 'zba', AA: 'zba', SUB: 'planning_board', SPR: 'planning_board' }
    for (const [prefix, chair] of Object.entries(chairByPrefix)) {
      for (const kind of ['notice_of_decision', 'decision_letter']) {
        const template = starter(prefix).templates.find((t) => t.kind === kind)
        if (template === undefined || !('body' in template)) throw new Error(`${prefix} ${kind}`)
        const rights = template.body.indexOf('{{decision.appealRights}}')
        const line = template.body.indexOf(`{{signer.${chair}_chair.name}}`)
        expect(rights, `${prefix} ${kind}`).toBeGreaterThan(-1)
        expect(line, `${prefix} ${kind}`).toBeGreaterThan(rights)
        expect(template.body).not.toContain('{{project.title}}')
      }
    }
  })
})
