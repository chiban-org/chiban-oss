import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderDecisionPdfs } from '@/features/decisions/decisionDocuments'
import { recordDecision } from '@/features/decisions/recordDecision'
import { doc, heading, locked, para } from '@/features/templates/doc/build'
import { defaultDoc } from '@/features/templates/kinds/documentKinds'
import { listTemplateSamples, previewTemplate } from '@/features/templates/preview/templatePreview'
import type { DocTemplateBody } from '@/features/templates/templateSchema'
import { BOARD_FIXTURE_NOW, type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { FIXTURE_VOTES, heldZbaHearing, publishBoardTemplates } from '@/test/hearingFixtures'
import { staffActor } from '@/test/parcels'
import { pdfText } from '@/test/pdfText'
import { pdfWording } from '@/test/pdfWording'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
})
afterEach(async () => {
  await handle.drop()
})

async function decided(): Promise<string> {
  await publishBoardTemplates(handle.db, world)
  const held = await heldZbaHearing(handle.db, world)
  const made = await recordDecision(
    handle.db,
    world.staff,
    {
      applicationId: held.applicationId,
      hearingId: held.hearingId,
      votedOn: '2027-04-15' as CivilDate,
      outcome: 'approved',
      motion: 'Move to act as presented.',
      votes: FIXTURE_VOTES,
      findings: 'The proposal meets each criterion of the ordinance.',
    },
    signal,
    BOARD_FIXTURE_NOW,
  )
  if (!made.ok) throw new Error(JSON.stringify(made.error))
  return made.value.decisionId
}

const LETTER: DocTemplateBody = {
  key: 'zba-letter',
  label: 'Decision letter',
  kind: 'decision_letter',
  format: 'doc',
  doc: doc(
    para('Dear {{party.applicant.name}}:'),
    heading('Your appeal rights'),
    locked('decision.appealRights'),
  ),
}

describe('template preview', () => {
  it('lists recorded decisions to preview a decision letter with', async () => {
    const decisionId = await decided()
    const listed = await listTemplateSamples(
      handle.db,
      await staffActor(handle.db, 'admin'),
      'decision_letter',
      signal,
    )
    if (!listed.ok) throw new Error(listed.error)
    expect(listed.value.map((s) => s.id)).toEqual([decisionId])
    expect(listed.value[0]?.label).toMatch(/approved April 15, 2027$/)
  })

  it('renders the draft letter with the sample record values', async () => {
    const decisionId = await decided()
    const shown = await previewTemplate(
      handle.db,
      await staffActor(handle.db, 'admin'),
      { body: LETTER, recordId: decisionId },
      signal,
    )
    if (!shown.ok) throw new Error(shown.error)
    expect(shown.value.locked['decision.appealRights']).toContain('RSA 677')
    expect(shown.value.values['decision.outcome']).toBe('Approved')
    const text = await pdfText(Buffer.from(shown.value.pdfBase64, 'base64'))
    expect(text).toContain('Your appeal rights')
    expect(text).toContain('RSA 677')
  })

  it('renders the standard decision letter the same as the real one', async () => {
    const decisionId = await decided()
    const real = await renderDecisionPdfs(handle.db, decisionId, signal)
    if (!real.ok) throw new Error(real.error)
    const letter = real.value[1]
    const body = { ...LETTER, label: letter?.title ?? '', doc: defaultDoc('decision_letter') }
    const shown = await previewTemplate(
      handle.db,
      await staffActor(handle.db, 'admin'),
      { body, recordId: decisionId },
      signal,
    )
    if (!shown.ok) throw new Error(shown.error)
    expect(await pdfWording(Buffer.from(shown.value.pdfBase64, 'base64'))).toBe(
      await pdfWording(letter?.bytes ?? new Uint8Array()),
    )
  })

  it('refuses someone who cannot change settings', async () => {
    const decisionId = await decided()
    const clerk = await staffActor(handle.db, 'inspector')
    expect(
      await previewTemplate(handle.db, clerk, { body: LETTER, recordId: decisionId }, signal),
    ).toEqual({ ok: false, error: 'forbidden' })
  })
})
