import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { abutterLists, boardMeetings, hearings } from '@/db/schema'
import { issueList } from '@/features/abutters/issue'
import { generateList } from '@/features/abutters/lists'
import { buildAgenda, publishAgenda } from '@/features/agendas/agendas'
import { addAppealNode } from '@/features/appeals/graph'
import { recordCompletenessVote, setAcceptanceMeeting } from '@/features/boards/acceptance'
import { recordDesDetermination } from '@/features/boards/des500'
import { inviteBoardMember } from '@/features/boards/members'
import { recordBoardRegionalImpact } from '@/features/boards/regionalImpact'
import { publishNewVersion } from '@/features/config/publish'
import { generateDecisionDocuments } from '@/features/decisions/decisionDocuments'
import { fileDecision } from '@/features/decisions/fileDecision'
import { recordDecision } from '@/features/decisions/recordDecision'
import { recordRegionalTransmittal } from '@/features/decisions/regionalTransmittal'
import { DEMO_DOMAIN } from '@/features/demo/domain'
import { COMMON } from '@/features/demo/seedBoardApps'
import {
  actorFor,
  type Cast,
  d,
  must,
  open,
  type Scenario,
} from '@/features/demo/seedPermitSupport'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { continueHearing } from '@/features/hearings/continuations'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { type ProofMethod, referenceRequired } from '@/features/notices/proofMethods'
import { recordProof } from '@/features/notices/proofs'
import { renderPdf } from '@/features/pdf/renderPdf'
import { signOffReview } from '@/features/reviews/assignments'
import { routeToTrc } from '@/features/reviews/trcRouting'
import type { ObjectStore } from '@/features/storage/objectStore'
import type { CivilDate } from '@/types/civilDate'

const METHOD: Record<string, ProofMethod> = {
  verified_mail: 'certificate_of_mailing',
  certified_mail: 'certified_mail',
  first_class_mail: 'first_class_mail',
  newspaper: 'newspaper_publication',
  public_posting: 'posting',
  bulletin_board: 'posting',
  website: 'website_posting',
}

const VOTES = {
  for: 4,
  against: 1,
  abstain: 0,
  members: [
    { name: 'Robin Vale', vote: 'for' as const },
    { name: 'Morgan Reed', vote: 'for' as const },
    { name: 'Casey Lund', vote: 'for' as const },
    { name: 'Avery Stone', vote: 'for' as const },
    { name: 'Drew Hale', vote: 'against' as const },
  ],
}

async function meetingId(db: Db, board: 'planning_board' | 'zba', date: string): Promise<string> {
  const [row] = await db
    .select({ id: boardMeetings.id })
    .from(boardMeetings)
    .where(and(eq(boardMeetings.board, board), eq(boardMeetings.meetingDate, date)))
  return row?.id ?? ''
}

async function demoDocument(
  db: Db,
  store: ObjectStore,
  cast: Cast,
  applicationId: string,
  title: string,
  signal: AbortSignal,
): Promise<string> {
  const pdf = await renderPdf({
    title,
    townName: 'Town of Alder Pond',
    scale: 'document',
    blocks: [{ kind: 'paragraph', text: `${title}. Demonstration record.` }],
  })
  return await db.transaction(async (tx) => {
    const stored = await storeGeneratedBytes(tx, store, pdf, 'application/pdf', signal)
    const attached = await attachDocument(
      tx,
      cast.staff,
      {
        target: { kind: 'application', id: applicationId },
        title,
        docKind: 'notice_proof',
        file: {
          sha256: stored.sha256,
          filename: `${stored.sha256.slice(0, 8)}.pdf`,
          contentType: 'application/pdf',
        },
        audiences: ['reviewers'],
      },
      signal,
    )
    return attached.documentId
  })
}

async function proveChannels(
  db: Db,
  store: ObjectStore,
  cast: Cast,
  applicationId: string,
  setId: string,
  skip: string[],
  effectiveOn: CivilDate,
  signal: AbortSignal,
  now: Date,
): Promise<void> {
  const status = await noticeStatus(db, setId, signal)
  for (const channel of new Set(status.items.map((i) => i.channel))) {
    if (skip.includes(channel)) continue
    const method = METHOD[channel]
    if (method === undefined) continue
    must(
      await recordProof(
        db,
        cast.staff,
        {
          itemIds: status.items.filter((i) => i.channel === channel).map((i) => i.itemId),
          method,
          reference: referenceRequired(method) ? 'RR-2026-0142' : null,
          effectiveOn,
          documentId: await demoDocument(db, store, cast, applicationId, 'Proof of notice', signal),
        },
        signal,
        now,
      ),
      `proof ${channel}`,
    )
  }
}

async function schedule(
  db: Db,
  cast: Cast,
  applicationId: string,
  board: 'planning_board' | 'zba',
  date: string,
  signal: AbortSignal,
) {
  const made = must(
    await scheduleHearing(
      db,
      cast.staff,
      { applicationId, meetingId: await meetingId(db, board, date), kind: 'public_hearing' },
      signal,
    ),
    `hearing ${date}`,
  )
  const [row] = await db.select().from(hearings).where(eq(hearings.id, made.hearingId))
  return { hearingId: made.hearingId, setId: row?.noticeSetId ?? '' }
}

async function holdNoticed(
  db: Db,
  cast: Cast,
  hearingId: string,
  heldOn: string,
  signal: AbortSignal,
  now: Date,
) {
  must(
    await markProperlyNoticed(db, cast.staff, hearingId, signal, now),
    `properly noticed ${hearingId}`,
  )
  must(await markHearingHeld(db, cast.staff, { hearingId, heldOn: d(heldOn) }, signal), 'held')
}

async function issueDraftList(db: Db, cast: Cast, s: Scenario, now: Date) {
  const [draft] = await db
    .select()
    .from(abutterLists)
    .where(and(eq(abutterLists.applicationId, s.applicationId), eq(abutterLists.status, 'draft')))
  const listId =
    draft?.id ??
    must(
      await generateList(db, cast.staff, { applicationId: s.applicationId }, s.signal, now),
      'list',
    ).listId
  must(await issueList(db, cast.staff, { listId }, s.signal, now), 'issue list')
}

async function seedMembers(db: Db, cast: Cast, signal: AbortSignal) {
  for (const [local, name, board] of [
    ['pb.member', 'Robin Vale', 'planning_board'],
    ['zba.member', 'Drew Hale', 'zba'],
  ] as const) {
    must(
      await inviteBoardMember(
        db,
        createMemoryTransport(),
        cast.admin,
        {
          email: `${local}@${DEMO_DOMAIN}`,
          displayName: name,
          board,
          title: 'member',
          termStart: d('2026-01-01'),
        },
        signal,
      ),
      `member ${local}`,
    )
  }
}

async function openDecidedSitePlan(
  db: Db,
  cast: Cast,
  signal: AbortSignal,
  now: Date,
): Promise<Scenario> {
  const s = await open(db, cast, signal, {
    parcel: '009017000000',
    title: 'Bittern Meadow site plan',
    typeKey: 'SPR',
    values: { ...COMMON, gross_floor_area_sq_ft: 5200, parking_spaces: 18 },
    submittedOn: '2026-07-01',
  })
  must(
    await recordBoardRegionalImpact(
      db,
      cast.staff,
      {
        applicationId: s.applicationId,
        determination: 'yes',
        municipalityKeys: ['pine_river', 'dunmore'],
      },
      signal,
      now,
    ),
    'regional impact',
  )
  must(
    await recordDesDetermination(
      db,
      cast.staff,
      { applicationId: s.applicationId, determination: 'not_within', reason: '' },
      signal,
      now,
    ),
    'des determination',
  )
  await issueDraftList(db, cast, s, now)
  const acceptance = await meetingId(db, 'planning_board', '2026-07-22')
  must(
    await setAcceptanceMeeting(
      db,
      cast.staff,
      { applicationId: s.applicationId, meetingId: acceptance },
      signal,
    ),
    'acceptance meeting',
  )
  must(
    await recordCompletenessVote(
      db,
      cast.staff,
      {
        applicationId: s.applicationId,
        meetingId: acceptance,
        votedOn: d('2026-07-22'),
        outcome: 'accepted',
      },
      signal,
    ),
    'completeness vote',
  )
  return s
}

async function seedSitePlanDecision(
  db: Db,
  store: ObjectStore,
  cast: Cast,
  signal: AbortSignal,
  now: Date,
) {
  const site = await openDecidedSitePlan(db, cast, signal, now)
  const { hearingId, setId } = await schedule(
    db,
    cast,
    site.applicationId,
    'planning_board',
    '2026-10-14',
    signal,
  )
  await proveChannels(db, store, cast, site.applicationId, setId, [], d('2026-09-25'), signal, now)
  await holdNoticed(db, cast, hearingId, '2026-10-14', signal, now)
  const decision = must(
    await recordDecision(
      db,
      cast.staff,
      {
        applicationId: site.applicationId,
        hearingId,
        votedOn: d('2026-10-14'),
        outcome: 'approved_with_conditions',
        motion: 'Move to approve with the conditions as read.',
        votes: VOTES,
        findings: 'The plan meets the site plan regulations for drainage, access, and screening.',
        conditions: [
          { code: 'C1', text: 'File the stamped drainage report.', precedent: true },
          { code: 'C2', text: 'Shield all exterior lights.', precedent: false },
        ],
      },
      signal,
    ),
    'site plan decision',
  )
  must(
    await generateDecisionDocuments(db, store, cast.staff, decision.decisionId, signal),
    'decision documents',
  )
  must(
    await fileDecision(
      db,
      cast.staff,
      {
        decisionId: decision.decisionId,
        filedOn: d('2026-10-21'),
        minutesDocumentId: await demoDocument(
          db,
          store,
          cast,
          site.applicationId,
          'Minutes of October 14',
          signal,
        ),
      },
      signal,
      now,
    ),
    'file decision',
  )
  must(
    await recordRegionalTransmittal(db, cast.staff, decision.decisionId, signal, now),
    'transmittal',
  )
}

async function openVariance(
  db: Db,
  cast: Cast,
  parcel: string,
  title: string,
  submittedOn: string,
  values: Record<string, unknown>,
  signal: AbortSignal,
  now: Date,
): Promise<Scenario> {
  const s = await open(db, cast, signal, { parcel, title, typeKey: 'VAR', values, submittedOn })
  must(
    await recordBoardRegionalImpact(
      db,
      cast.staff,
      { applicationId: s.applicationId, determination: 'no', municipalityKeys: [] },
      signal,
      now,
    ),
    'regional impact',
  )
  await issueDraftList(db, cast, s, now)
  return s
}

async function seedContinuedVariance(
  db: Db,
  store: ObjectStore,
  cast: Cast,
  values: Record<string, unknown>,
  signal: AbortSignal,
  now: Date,
) {
  const s = await openVariance(
    db,
    cast,
    '009001000000',
    'Marsh Lane lot coverage variance',
    '2026-10-26',
    values,
    signal,
    now,
  )
  const { hearingId, setId } = await schedule(
    db,
    cast,
    s.applicationId,
    'zba',
    '2026-11-17',
    signal,
  )
  await proveChannels(
    db,
    store,
    cast,
    s.applicationId,
    setId,
    ['newspaper'],
    d('2026-11-01'),
    signal,
    now,
  )
  must(
    await continueHearing(
      db,
      cast.staff,
      {
        hearingId,
        toMeetingId: await meetingId(db, 'zba', '2026-12-15'),
        announcedAtMeeting: false,
      },
      signal,
    ),
    'continue without announcement',
  )
}

async function seedDeniedVariance(
  db: Db,
  store: ObjectStore,
  cast: Cast,
  signal: AbortSignal,
  now: Date,
  values: Record<string, unknown>,
) {
  const s = await openVariance(
    db,
    cast,
    '009017000000',
    'Heron Cove setback variance',
    '2026-09-02',
    values,
    signal,
    now,
  )
  const { hearingId, setId } = await schedule(
    db,
    cast,
    s.applicationId,
    'zba',
    '2026-10-20',
    signal,
  )
  await proveChannels(db, store, cast, s.applicationId, setId, [], d('2026-10-10'), signal, now)
  await holdNoticed(db, cast, hearingId, '2026-10-20', signal, now)
  const decision = must(
    await recordDecision(
      db,
      cast.staff,
      {
        applicationId: s.applicationId,
        hearingId,
        votedOn: d('2026-10-20'),
        outcome: 'denied',
        motion: 'Move to deny the variance.',
        votes: VOTES,
        findings: 'The lot can be used without the relief requested.',
        reasonsForDisapproval:
          'The hardship test is not met because a conforming addition is possible.',
      },
      signal,
    ),
    'denial',
  )
  const [node] = await db.query.appealNodes.findMany({
    where: (n, { eq: equals }) => equals(n.decisionId, decision.decisionId),
  })
  must(
    await addAppealNode(
      db,
      cast.staff,
      { parentId: node?.id ?? '', kind: 'rehearing_motion', occurredOn: d('2026-11-02') },
      signal,
    ),
    'rehearing motion',
  )
}

async function seedTrc(db: Db, cast: Cast, application: Scenario, signal: AbortSignal) {
  const ids: Record<string, string> = {}
  for (const local of ['fire', 'works', 'reviewer']) {
    const actor = await actorFor(db, local, signal)
    ids[local] = actor.userId
  }
  const published = await db.transaction((tx) =>
    publishNewVersion(
      tx,
      cast.admin,
      {
        kind: 'review_routes',
        key: 'default',
        body: {
          key: 'default',
          departments: [
            { key: 'fire', label: 'Fire', reviewerUserIds: [ids.fire ?? ''] },
            { key: 'public_works', label: 'Public Works', reviewerUserIds: [ids.works ?? ''] },
            { key: 'police', label: 'Police', reviewerUserIds: [ids.reviewer ?? ''] },
          ],
          routes: [
            {
              applicationTypeKey: 'SPR',
              departmentKeys: ['fire', 'public_works', 'police'],
              commentDueDaysBeforeMeeting: 7,
            },
          ],
        },
      },
      'config.publish',
      signal,
    ),
  )
  must(published, 'publish review routes')
  must(
    await routeToTrc(db, cast.staff, { applicationId: application.applicationId }, signal),
    'route to TRC',
  )
  const fire = await actorFor(db, 'fire', signal)
  const [assignment] = await db.query.reviewAssignments.findMany({
    where: (a, { and: both, eq: equals }) =>
      both(
        equals(a.applicationId, application.applicationId),
        equals(a.reviewerUserId, fire.userId),
      ),
  })
  must(
    await signOffReview(db, fire, { assignmentId: assignment?.id ?? '' }, signal),
    'fire sign-off',
  )
}

export async function seedHearings(
  db: Db,
  store: ObjectStore,
  cast: Cast,
  scenarios: { sitePlan: Scenario },
  values: Record<string, unknown>,
  signal: AbortSignal,
  now: Date,
): Promise<void> {
  await seedMembers(db, cast, signal)
  await seedSitePlanDecision(db, store, cast, signal, now)
  await seedContinuedVariance(db, store, cast, values, signal, now)
  await seedDeniedVariance(db, store, cast, signal, now, values)
  await seedTrc(db, cast, scenarios.sitePlan, signal)
  const agendaMeeting = await meetingId(db, 'zba', '2026-12-15')
  must(await buildAgenda(db, cast.staff, agendaMeeting, signal), 'build agenda')
  must(await publishAgenda(db, store, cast.staff, agendaMeeting, signal), 'publish agenda')
}
