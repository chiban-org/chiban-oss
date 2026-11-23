import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { boardDecisions, clocks, decisionDeliveries, documents, projectParties } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { recordDecisionDelivery } from '@/features/decisions/delivery'
import { recordDecision } from '@/features/decisions/recordDecision'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import type { ClockRule, DecisionDeliveryRule, PackRule } from '@/features/packs/schema'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  boardIdSql,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { issueListWithRecipients, proveEverything, recipient } from '@/test/noticeFixtures'
import { XX_PACK } from '@/test/packs/xx'
import { xxPackWith } from '@/test/packs/xx/variants'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate

export const HEARING_DATE = '2027-04-15'
export const DUE_KEY = 'xx.zba.delivery_due'
export const FILING_KEY = 'xx.zba.filing'
const ACT = 'https://laws.example/vellmora/permit-act'

export const dueClock: ClockRule = {
  kind: 'clock',
  key: DUE_KEY,
  version: 1,
  label: 'Deliver the board decision',
  citation: { label: 'Vellmora Permit Act 12', url: ACT },
  clockType: 'action_due',
  whose: 'board',
  startEvent: 'board_vote',
  length: { unit: 'days', value: 7 },
  direction: 'after',
  consequence: { kind: 'none_stated', text: 'The act states no consequence.' },
  extension: { allowed: false, note: 'The act provides no extension.' },
  waivable: false,
  overridePolicy: { policy: 'fixed' },
}

const filingClock: ClockRule = {
  ...dueClock,
  key: FILING_KEY,
  label: 'File the board decision',
  clockType: 'filing_window',
  length: { unit: 'days', value: 3 },
}

export const deliveryRule: DecisionDeliveryRule = {
  kind: 'decision_delivery',
  key: 'xx.zba.delivery',
  version: 1,
  label: 'Deliver the board decision',
  citation: { label: 'Vellmora Permit Act 12', url: ACT },
  boardKinds: ['zba'],
  recipients: ['applicant', 'agent', 'planning_board', 'municipal_officers'],
  methods: ['mail', 'hand'],
  dueRuleKey: DUE_KEY,
  overridePolicy: { policy: 'fixed' },
}

export function deliveryPack(rule: DecisionDeliveryRule = deliveryRule, withFiling = false) {
  const rules: PackRule[] = [
    ...XX_PACK.manifest.rules,
    dueClock,
    rule,
    ...(withFiling ? [filingClock] : []),
  ]
  return xxPackWith({
    roles: withFiling ? { rules: { decisionFiling: FILING_KEY } } : {},
    manifest: {
      rules,
      classifications: XX_PACK.manifest.classifications.map((c) =>
        c.key === 'xx.board_variance'
          ? { ...c, mandatoryRuleKeys: [...c.mandatoryRuleKeys, DUE_KEY] }
          : c,
      ),
    },
    pack: {
      ruleAreas: [{ title: 'All rules', rules }],
      appealRoutes: [
        {
          from: 'zba_appeal',
          to: 'zba_decision',
          windowRuleKey: null,
          citation: { label: 'Vellmora Permit Act 12', url: ACT },
        },
      ],
    },
  })
}

export const FULL_PACK = deliveryPack()
export const FILING_PACK = deliveryPack(deliveryRule, true)

export const VOTES = {
  for: 3,
  against: 0,
  abstain: 0,
  members: [
    { name: 'Avery Stone', vote: 'for' as const },
    { name: 'Robin Vale', vote: 'for' as const },
    { name: 'Morgan Reed', vote: 'for' as const },
  ],
}

async function heldHearing(db: Db, world: BoardWorld) {
  const applicationId = await submitBoardApplication(db, world, world.zbaTypeKey, '2027-03-02')
  await issueListWithRecipients(db, world, applicationId, [recipient(1), recipient(2)])
  const meeting = await db.query.boardMeetings.findMany({
    where: (m, { and, eq: same }) =>
      and(same(m.meetingDate, HEARING_DATE), same(m.boardId, boardIdSql('zba'))),
  })
  const scheduled = await scheduleHearing(
    db,
    world.staff,
    { applicationId, meetingId: meeting[0]?.id ?? '', kind: 'public_hearing' },
    signal,
  )
  if (!scheduled.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'not scheduled')
  const { hearingId } = scheduled.value
  const [hearing] = await db.query.hearings.findMany({
    where: (h, { eq: same }) => same(h.id, hearingId),
  })
  const now = new Date(`${HEARING_DATE}T16:00:00Z`)
  await proveEverything(db, world, applicationId, hearing?.noticeSetId ?? '', d('2027-03-30'), now)
  await markProperlyNoticed(db, world.staff, hearingId, signal, now)
  await markHearingHeld(db, world.staff, { hearingId, heldOn: d(HEARING_DATE) }, signal, now)
  return { applicationId, hearingId }
}

export async function decideUnderXx(db: Db, world: BoardWorld, votedOn: string = HEARING_DATE) {
  const held = await heldHearing(db, world)
  const decided = await recordDecision(
    db,
    world.staff,
    {
      ...held,
      votedOn: d(votedOn),
      outcome: 'approved',
      motion: 'Move to approve as presented.',
      votes: VOTES,
      findings: 'The proposal meets each criterion.',
    },
    signal,
    BOARD_FIXTURE_NOW,
  )
  if (!decided.ok)
    throw new AppError(ErrorIds.DB_INVARIANT, `not decided: ${JSON.stringify(decided.error)}`)
  return { ...held, decisionId: decided.value.decisionId }
}

export async function readyToFile(
  db: Db,
  made: { applicationId: string; decisionId: string },
): Promise<{ minutesId: string }> {
  const insert = async (title: string, docKind: 'attachment') => {
    const [row] = await db
      .insert(documents)
      .values({
        recordKind: 'application',
        recordId: made.applicationId,
        title,
        docKind,
        createdByKind: 'system',
      })
      .returning({ id: documents.id })
    return row?.id ?? ''
  }
  const writtenId = await insert('Notice of Decision', 'attachment')
  const minutesId = await insert('Minutes', 'attachment')
  await db
    .update(boardDecisions)
    .set({ writtenDecisionDocumentId: writtenId })
    .where(eq(boardDecisions.id, made.decisionId))
  return { minutesId }
}

export async function addAgentParty(db: Db, world: BoardWorld): Promise<void> {
  await db.insert(projectParties).values({
    projectId: world.projectId,
    name: 'Pat Agent',
    role: 'agent',
    addedBy: world.staff.userId,
  })
}

export async function deliveriesOf(db: Db, applicationId: string) {
  const rows = await db
    .select()
    .from(decisionDeliveries)
    .where(eq(decisionDeliveries.applicationId, applicationId))
  return rows.sort((a, b) => a.recipientRole.localeCompare(b.recipientRole))
}

export async function dueClockOf(db: Db, applicationId: string) {
  const rows = await db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
  return rows.find((c) => c.ruleKey === DUE_KEY)
}

export async function deliver(
  db: Db,
  actor: Actor,
  deliveryId: string,
  deliveredOn: string,
  method: 'mail' | 'hand' = 'mail',
) {
  return await recordDecisionDelivery(
    db,
    actor,
    { deliveryId, method, deliveredOn: d(deliveredOn) },
    signal,
    new Date('2027-06-01T16:00:00Z'),
  )
}
