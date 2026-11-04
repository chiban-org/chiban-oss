import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateDecisionDocuments } from '@/features/decisions/decisionDocuments'
import { type RecordDecisionInput, recordDecision } from '@/features/decisions/recordDecision'
import type { ObjectStore } from '@/features/storage/objectStore'
import { BOARD_FIXTURE_NOW, type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { FIXTURE_VOTES, heldZbaHearing, publishBoardTemplates } from '@/test/hearingFixtures'
import { makeTestStore } from '@/test/minio'
import { downloadObject } from '@/test/objectBytes'
import { pdfWording } from '@/test/pdfWording'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

async function generatedWording(overrides: Partial<RecordDecisionInput>) {
  await publishBoardTemplates(handle.db, world)
  const held = await heldZbaHearing(handle.db, world)
  const decided = await recordDecision(
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
      ...overrides,
    },
    signal,
    BOARD_FIXTURE_NOW,
  )
  if (!decided.ok) throw new Error(JSON.stringify(decided.error))
  const made = await generateDecisionDocuments(
    handle.db,
    store,
    world.staff,
    decided.value.decisionId,
    signal,
  )
  if (!made.ok) throw new Error(made.error)
  return {
    notice: await pdfWording(await downloadObject(handle.db, store, made.value.noticeOfDecisionId)),
    letter: await pdfWording(await downloadObject(handle.db, store, made.value.letterId)),
  }
}

describe('decision document wording', () => {
  it('approved with conditions', async () => {
    const { notice, letter } = await generatedWording({
      outcome: 'approved_with_conditions',
      conditions: [
        { code: 'SURVEY', text: 'File a stamped boundary survey.', precedent: true },
        { code: 'SHIELD', text: 'Shield all exterior lights.', precedent: false },
      ],
    })
    expect(notice).toMatchInlineSnapshot(`
      "Town of Alder Pond

      Variance notice of decision

      Town of Alder Pond

      Notice of decision of the Alder Pond Zoning Board of Adjustment on VAR VAR-2027-0001, Garage
      addition, parcel 007001000000, Not recorded. Applicant Not recorded.

      Decision: Approved with conditions, voted April 15, 2027.

      Findings of fact: The proposal meets each criterion of the ordinance.

      Conditions: File a stamped boundary survey.; Shield all exterior lights.

      A party or person directly affected may move for rehearing within 30 days after the vote (RSA 677:2).

      Page 1 of 1

      "
    `)
    expect(letter).toMatchInlineSnapshot(`
      "Town of Alder Pond

      Variance decision letter

      Town of Alder Pond

      Dear Not recorded:

      On April 15, 2027 the Alder Pond Zoning Board of Adjustment voted on VAR VAR-2027-0001 for Not
      recorded. The decision is: Approved with conditions.

      Findings of fact: The proposal meets each criterion of the ordinance.

      Conditions: File a stamped boundary survey.; Shield all exterior lights.

      A party or person directly affected may move for rehearing within 30 days after the vote (RSA 677:2).

      Page 1 of 1

      "
    `)
  })

  it('denied with reasons', async () => {
    const { notice, letter } = await generatedWording({
      outcome: 'denied',
      reasonsForDisapproval: 'The hardship criterion is not met.',
    })
    expect(notice).toMatchInlineSnapshot(`
      "Town of Alder Pond

      Variance notice of decision

      Town of Alder Pond

      Notice of decision of the Alder Pond Zoning Board of Adjustment on VAR VAR-2027-0001, Garage
      addition, parcel 007001000000, Not recorded. Applicant Not recorded.

      Decision: Denied, voted April 15, 2027.

      Findings of fact: The proposal meets each criterion of the ordinance.

      Reasons for disapproval: The hardship criterion is not met.

      A party or person directly affected may move for rehearing within 30 days after the vote (RSA 677:2).

      Page 1 of 1

      "
    `)
    expect(letter).toMatchInlineSnapshot(`
      "Town of Alder Pond

      Variance decision letter

      Town of Alder Pond

      Dear Not recorded:

      On April 15, 2027 the Alder Pond Zoning Board of Adjustment voted on VAR VAR-2027-0001 for Not
      recorded. The decision is: Denied.

      Findings of fact: The proposal meets each criterion of the ordinance.

      Reasons for disapproval: The hardship criterion is not met.

      A party or person directly affected may move for rehearing within 30 days after the vote (RSA 677:2).

      Page 1 of 1

      "
    `)
  })
})
