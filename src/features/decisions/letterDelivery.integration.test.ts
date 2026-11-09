import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applications,
  auditLog,
  boardDecisions,
  letterMailings,
  notificationOutbox,
  projectParties,
} from '@/db/schema'
import { fileDecision } from '@/features/decisions/fileDecision'
import { lettersToMail, recordLetterMailed } from '@/features/decisions/letterDelivery'
import { resolveRendition } from '@/features/documents/visibility'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { sendQueuedNotifications } from '@/features/notifications/send'
import type { ObjectStore } from '@/features/storage/objectStore'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba } from '@/test/hearingFixtures'
import { proofDocument } from '@/test/noticeFixtures'
import { makeTestStore } from '@/test/objectStore'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const AFTER_FILING = new Date('2027-07-20T16:00:00Z')
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

async function projectOf(applicationId: string): Promise<string> {
  const [app] = await handle.db
    .select({ projectId: applications.projectId })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return app?.projectId ?? ''
}

async function addParty(
  applicationId: string,
  party: { name: string; role: 'agent' | 'applicant' | 'owner'; email: string | null },
) {
  const [row] = await handle.db
    .insert(projectParties)
    .values({ projectId: await projectOf(applicationId), addedBy: world.staff.userId, ...party })
    .returning({ id: projectParties.id })
  return row?.id ?? ''
}

async function decidedWithParties() {
  const made = await decidedZba(handle.db, world, store, { votedOn: '2027-07-01' })
  const paperAgent = await addParty(made.applicationId, {
    name: 'Pat Paper',
    role: 'agent',
    email: null,
  })
  const emailAgent = await addParty(made.applicationId, {
    name: 'Eli Email',
    role: 'agent',
    email: 'eli@agent.example',
  })
  const coApplicant = await addParty(made.applicationId, {
    name: 'Cora Claim',
    role: 'applicant',
    email: 'cora@applicant.example',
  })
  const owner = await addParty(made.applicationId, {
    name: 'Owen Owner',
    role: 'owner',
    email: null,
  })
  return { ...made, paperAgent, emailAgent, coApplicant, owner }
}

async function file(made: { applicationId: string; decisionId: string }) {
  return await fileDecision(
    handle.db,
    world.staff,
    {
      decisionId: made.decisionId,
      filedOn: d('2027-07-09'),
      minutesDocumentId: await proofDocument(handle.db, world, made.applicationId),
    },
    signal,
    AFTER_FILING,
  )
}

describe('decision letter delivery', () => {
  it('emails the applicant and agents who can be reached when the decision is filed', async () => {
    const made = await decidedWithParties()
    expect((await file(made)).ok).toBe(true)
    const rows = await handle.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.event, 'decision_filed'))
    expect(rows.map((r) => r.recipientUserId ?? r.recipientPartyId).sort()).toEqual(
      [world.applicant.userId, made.coApplicant].sort(),
    )
    expect(rows[0]?.payload).toMatchObject({
      outcomeLabel: 'Approved',
      filedOn: '2027-07-09',
      boardName: expect.any(String),
    })
    const mail = createMemoryTransport()
    await sendQueuedNotifications(handle.db, mail, signal)
    const decisionMail = mail.sent.filter((m) => m.subject.startsWith('Decision filed: '))
    expect(decisionMail).toHaveLength(2)
    expect(decisionMail[0]?.subject).toMatch(/^Decision filed: .+, Approved$/)
    const claimMail = decisionMail.find((m) => m.to === 'cora@applicant.example')
    expect(claimMail?.text).toContain('/claim/')
    const accountMail = decisionMail.find((m) => m.to !== 'cora@applicant.example')
    expect(accountMail?.text).toContain(`/portal/applications/${made.applicationId}`)
    expect(accountMail?.text).toContain('July 9, 2027')
  })

  it('puts the letter on the to mail list for applicants and agents email cannot reach', async () => {
    const made = await decidedWithParties()
    await file(made)
    const [decision] = await handle.db
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.id, made.decisionId))
    const listed = await lettersToMail(handle.db, made.applicationId, signal)
    expect(listed.map((l) => l.partyName).sort()).toEqual(['Eli Email', 'Pat Paper'])
    expect(listed.every((l) => l.documentId === decision?.letterDocumentId)).toBe(true)
    expect(listed.every((l) => l.mailedOn === null)).toBe(true)
    const letter = await resolveRendition(
      handle.db,
      world.applicant,
      decision?.letterDocumentId ?? '',
      signal,
    )
    expect(letter.ok).toBe(true)
  })

  it('records the mailing once, for staff who record board work, and audits it', async () => {
    const made = await decidedWithParties()
    await file(made)
    const [first] = await lettersToMail(handle.db, made.applicationId, signal)
    const input = { mailingId: first?.id ?? '', mailedOn: d('2027-07-12'), now: AFTER_FILING }
    expect(await recordLetterMailed(handle.db, world.applicant, input, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(
      await recordLetterMailed(
        handle.db,
        world.staff,
        { ...input, mailedOn: d('2027-07-30') },
        signal,
      ),
    ).toEqual({ ok: false, error: 'future_date' })
    expect(await recordLetterMailed(handle.db, world.staff, input, signal)).toEqual({
      ok: true,
      value: undefined,
    })
    expect(await recordLetterMailed(handle.db, world.staff, input, signal)).toEqual({
      ok: false,
      error: 'already_mailed',
    })
    const [row] = await handle.db
      .select()
      .from(letterMailings)
      .where(eq(letterMailings.id, input.mailingId))
    expect(row).toMatchObject({ mailedOn: '2027-07-12', mailedBy: world.staff.userId })
    const audits = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'decision.letter_mailed'))
    expect(audits).toHaveLength(1)
  })
})
