import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appealNodes,
  applications,
  auditLog,
  clocks,
  decisionNotices,
  deemedRefusals,
  documents,
  notificationOutbox,
} from '@/db/schema'
import { loadGraphNodeRows } from '@/features/appeals/graphNodeRows'
import { nodeWindow } from '@/features/appeals/nodeWindow'
import { recordDecisionNotice, refuseBySilence } from '@/features/applications/deemedRefusal'
import { getStaffApplicationView } from '@/features/applications/staffApplicationView'
import { transitionApplication } from '@/features/applications/transition'
import { startClocksFor } from '@/features/clocks/startClocks'
import { setActivePackForTest } from '@/features/packs/registry'
import type { AppealRoute, ClockRule } from '@/features/packs/schema'
import { getPortalApplicationView } from '@/features/portal/portalView'
import { clocksDailyJob } from '@/jobs/clocksDaily'
import { runJob } from '@/jobs/defineJob'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { XX_PACK } from '@/test/packs/xx'
import { xxPackWith } from '@/test/packs/xx/variants'
import { signedOffReview } from '@/test/reviewFixtures'
import { addDays, type CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const RULE = 'xx.bp.decision'
const STARTED = d('2027-03-01')
const DUE = addDays(STARTED, 21)
const DAY_AFTER = addDays(DUE, 1)
const NOW = new Date('2027-04-15T15:00:00Z')

const refusingRules = XX_PACK.manifest.rules.map((r) =>
  r.key === RULE && r.kind === 'clock'
    ? {
        ...r,
        consequence: {
          kind: 'deemed_refused' as const,
          text: 'Failure to decide within the period is a refusal.',
        },
      }
    : r,
)

const refusingPack = xxPackWith({
  manifest: { rules: refusingRules },
  pack: { ruleAreas: [{ title: 'All rules', rules: refusingRules }] },
})

let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  setActivePackForTest(refusingPack)
  await saveAndPublish(
    handle.db,
    world.admin,
    'application_type',
    'BPX',
    appTypeBody({
      key: 'BPX',
      prefix: 'BX',
      classification: 'xx.building_permit',
      bindings: [RULE],
    }),
  )
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function clockedApp(
  state: 'submitted' | 'under_review' | 'decided' | 'issued' = 'under_review',
) {
  const app = await makeApplication(handle.db, world, { state }, NOW, 'BPX')
  await handle.db.transaction((tx) =>
    startClocksFor(tx, app.applicationId, 'application_completed', STARTED, signal),
  )
  return app
}

async function clockOf(applicationId: string) {
  const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
  return rows.find((c) => c.ruleKey === RULE)
}

async function appOf(applicationId: string) {
  const [row] = await handle.db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row
}

async function noticeDocument(applicationId: string) {
  const [doc] = await handle.db
    .insert(documents)
    .values({
      recordKind: 'application',
      recordId: applicationId,
      title: 'Decision notice',
      docKind: 'attachment',
      createdByKind: 'system',
    })
    .returning({ id: documents.id })
  return doc?.id ?? ''
}

async function record(applicationId: string, mailedOn: string) {
  return await recordDecisionNotice(
    handle.db,
    world.staff,
    { applicationId, documentId: await noticeDocument(applicationId), mailedOn: d(mailedOn) },
    signal,
    NOW,
  )
}

const sweep = (today: CivilDate) =>
  handle.db.transaction(async (tx) => {
    const { failures, ...rest } = await refuseBySilence(tx, today, signal)
    expect(failures).toEqual([])
    return rest
  })

describe('refusal by silence', () => {
  it('refuses an application with no written decision notice the day after its clock runs out', async () => {
    const { applicationId } = await clockedApp()
    expect(await sweep(DUE)).toEqual({ refused: [], noticeOverdue: [] })
    const result = await sweep(DAY_AFTER)
    expect(result.refused).toEqual([applicationId])
    expect((await appOf(applicationId))?.state).toBe('denied')
    const [refusal] = await handle.db
      .select()
      .from(deemedRefusals)
      .where(eq(deemedRefusals.applicationId, applicationId))
    expect(refusal).toMatchObject({ ruleKey: RULE, dueOn: DUE, firedOn: DAY_AFTER })
    expect((await clockOf(applicationId))?.status).toBe('lapsed')
  })

  it('a notice mailed on the due day meets the clock and nothing fires', async () => {
    const { applicationId } = await clockedApp('decided')
    expect((await record(applicationId, DUE)).ok).toBe(true)
    expect(await sweep(DAY_AFTER)).toEqual({ refused: [], noticeOverdue: [] })
    const clock = await clockOf(applicationId)
    expect(clock).toMatchObject({ status: 'met', metOn: DUE })
    expect((await appOf(applicationId))?.state).toBe('decided')
    const [notice] = await handle.db.select().from(decisionNotices)
    expect(notice).toMatchObject({ applicationId, mailedOn: DUE })
  })

  it('does not refuse an application that has a notice even when its clock was overwritten as overdue', async () => {
    const { applicationId } = await clockedApp()
    await handle.db.insert(decisionNotices).values({
      applicationId,
      documentId: await noticeDocument(applicationId),
      mailedOn: DUE,
      recordedBy: world.staff.userId,
    })
    await handle.db
      .update(clocks)
      .set({ status: 'overdue', metOn: null })
      .where(eq(clocks.applicationId, applicationId))
    expect(await sweep(DAY_AFTER)).toEqual({ refused: [], noticeOverdue: [] })
    expect((await appOf(applicationId))?.state).toBe('under_review')
    const refusals = await handle.db
      .select()
      .from(deemedRefusals)
      .where(eq(deemedRefusals.applicationId, applicationId))
    expect(refusals).toEqual([])
  })

  it('issuing without a notice leaves the clock running and lists it as notice overdue, without refusing', async () => {
    const { applicationId } = await clockedApp('under_review')
    await signedOffReview(handle.db, world, applicationId, signal)
    for (const to of ['decided', 'issued'] as const) {
      const row = await appOf(applicationId)
      const moved = await handle.db.transaction((tx) =>
        transitionApplication(
          tx,
          world.staff,
          {
            applicationId,
            to,
            expectedRowVersion: row?.rowVersion ?? 0,
            onDate: d('2027-03-10'),
          },
          signal,
          NOW,
        ),
      )
      expect(moved.ok).toBe(true)
    }
    expect((await clockOf(applicationId))?.status).toBe('running')
    const result = await sweep(DAY_AFTER)
    expect(result).toEqual({ refused: [], noticeOverdue: [applicationId] })
    expect((await appOf(applicationId))?.state).toBe('issued')
    expect((await clockOf(applicationId))?.status).toBe('running')
    expect(await handle.db.select().from(deemedRefusals)).toEqual([])
  })

  it('leaves a withdrawn application alone', async () => {
    const { applicationId } = await clockedApp('under_review')
    await handle.db
      .update(applications)
      .set({ state: 'withdrawn' })
      .where(eq(applications.id, applicationId))
    expect(await sweep(DAY_AFTER)).toEqual({ refused: [], noticeOverdue: [] })
    expect((await appOf(applicationId))?.state).toBe('withdrawn')
  })

  it('refuses nothing new when the job runs again', async () => {
    const { applicationId } = await clockedApp()
    expect((await sweep(DAY_AFTER)).refused).toEqual([applicationId])
    expect(await sweep(addDays(DAY_AFTER, 1))).toEqual({ refused: [], noticeOverdue: [] })
    expect(await handle.db.select().from(deemedRefusals)).toHaveLength(1)
  })

  it('refuses through the daily job after it marks the clock overdue', async () => {
    const { applicationId } = await clockedApp()
    const ran = await runJob(handle.db, clocksDailyJob, { today: DAY_AFTER }, signal)
    expect(ran.ok).toBe(true)
    expect((await appOf(applicationId))?.state).toBe('denied')
  })

  it('queues no overdue email for a refused clock, while a clock still owed its notice gets one', async () => {
    const refused = await clockedApp()
    const owed = await clockedApp('decided')
    const ran = await runJob(handle.db, clocksDailyJob, { today: DAY_AFTER }, signal)
    expect(ran.ok).toBe(true)
    expect((await appOf(refused.applicationId))?.state).toBe('denied')
    const overdue = await handle.db
      .selectDistinct({ applicationId: notificationOutbox.applicationId })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.event, 'clock_overdue'))
    expect(overdue).toEqual([{ applicationId: owed.applicationId }])
  })

  it('opens the administrative appeal path on the refusal date with a system-created node', async () => {
    const { applicationId } = await clockedApp()
    await sweep(DAY_AFTER)
    const [node] = await handle.db
      .select()
      .from(appealNodes)
      .where(eq(appealNodes.applicationId, applicationId))
    expect(node).toMatchObject({
      kind: 'administrative_decision',
      occurredOn: DAY_AFTER,
      outcome: 'denied',
      createdBy: null,
    })
    const [audit] = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, node?.id ?? ''))
    expect(audit).toMatchObject({ actorKind: 'system', action: 'appeal.node.add' })
  })

  it('dates the refusal and its appeal node the day after the clock ran out when the job missed days', async () => {
    const { applicationId } = await clockedApp()
    const late = addDays(DUE, 5)
    expect((await sweep(late)).refused).toEqual([applicationId])
    const [refusal] = await handle.db
      .select()
      .from(deemedRefusals)
      .where(eq(deemedRefusals.applicationId, applicationId))
    expect(refusal).toMatchObject({ dueOn: DUE, firedOn: DAY_AFTER })
    const [node] = await handle.db
      .select()
      .from(appealNodes)
      .where(eq(appealNodes.applicationId, applicationId))
    expect(node?.occurredOn).toBe(DAY_AFTER)
    const view = await getStaffApplicationView(handle.db, world.staff, applicationId, NOW, signal)
    expect(view?.decisionNotice?.refusedOn).toBe(DAY_AFTER)
  })

  it('sends no denial notice by itself', async () => {
    const { applicationId } = await clockedApp()
    await sweep(DAY_AFTER)
    expect(await handle.db.select().from(notificationOutbox)).toEqual([])
    expect((await appOf(applicationId))?.state).toBe('denied')
  })

  it('records a notice after a refusal as the refusal notice', async () => {
    const { applicationId } = await clockedApp()
    await sweep(DAY_AFTER)
    expect((await record(applicationId, DAY_AFTER)).ok).toBe(true)
    expect((await appOf(applicationId))?.state).toBe('denied')
  })

  it('refuses a notice while the application has no decision', async () => {
    for (const state of ['submitted', 'under_review'] as const) {
      const { applicationId } = await clockedApp(state)
      expect(await record(applicationId, DUE)).toEqual({ ok: false, error: 'no_decision' })
      expect(await handle.db.select().from(decisionNotices)).toEqual([])
      expect((await clockOf(applicationId))?.status).toBe('running')
    }
  })

  it('refuses a second notice, a future date and a missing document', async () => {
    const { applicationId } = await clockedApp('decided')
    expect((await record(applicationId, DUE)).ok).toBe(true)
    expect(await record(applicationId, DUE)).toEqual({ ok: false, error: 'already_recorded' })
    const other = await clockedApp('decided')
    expect(await record(other.applicationId, '2027-12-01')).toEqual({
      ok: false,
      error: 'future_date',
    })
    const missing = await recordDecisionNotice(
      handle.db,
      world.staff,
      {
        applicationId: other.applicationId,
        documentId: '00000000-0000-0000-0000-000000000000',
        mailedOn: DUE,
      },
      signal,
      NOW,
    )
    expect(missing).toEqual({ ok: false, error: 'document_not_found' })
  })

  it('refuses a notice from an actor without the issue capability', async () => {
    const { applicationId } = await clockedApp()
    const result = await recordDecisionNotice(
      handle.db,
      world.reviewer,
      { applicationId, documentId: await noticeDocument(applicationId), mailedOn: DUE },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('refusal edge cases', () => {
  it('refuses an application still in submitted', async () => {
    const { applicationId } = await clockedApp('submitted')
    expect((await sweep(DAY_AFTER)).refused).toEqual([applicationId])
    expect((await appOf(applicationId))?.state).toBe('denied')
  })

  it('collects a failed refusal, restores the clock and leaves the application alone', async () => {
    const { applicationId } = await clockedApp()
    await handle.db
      .update(clocks)
      .set({ status: 'overdue' })
      .where(eq(clocks.applicationId, applicationId))
    const failing = () => Promise.resolve({ ok: false as const, error: 'stale_version' as const })
    const result = await handle.db.transaction((tx) =>
      refuseBySilence(tx, DAY_AFTER, signal, failing),
    )
    expect(result.refused).toEqual([])
    expect(result.failures).toHaveLength(1)
    expect((await clockOf(applicationId))?.status).toBe('overdue')
    expect((await appOf(applicationId))?.state).toBe('under_review')
    expect(await handle.db.select().from(deemedRefusals)).toEqual([])
    expect((await sweep(DAY_AFTER)).refused).toEqual([applicationId])
  })

  it('shows no decision deadline on the portal for an issued permit still owed its notice', async () => {
    const { applicationId } = await clockedApp('under_review')
    await handle.db
      .update(clocks)
      .set({ currentDue: '2020-01-01' })
      .where(eq(clocks.applicationId, applicationId))
    const open = await getPortalApplicationView(handle.db, world.applicant, applicationId, signal)
    expect(open.ok && open.value.decisionDue?.late).toBe(true)
    await handle.db
      .update(applications)
      .set({ state: 'issued' })
      .where(eq(applications.id, applicationId))
    const view = await getPortalApplicationView(handle.db, world.applicant, applicationId, signal)
    expect(view.ok && view.value.decisionDue).toBeNull()
  })
})

describe('the decision notice on the staff view and the portal', () => {
  const staffView = async (applicationId: string, now: Date = NOW) =>
    await getStaffApplicationView(handle.db, world.staff, applicationId, now, signal)

  it('reports the due date and citation before a notice is recorded', async () => {
    const { applicationId } = await clockedApp()
    const view = await staffView(applicationId, new Date('2027-03-10T15:00:00Z'))
    expect(view?.decisionNotice).toEqual({
      required: true,
      dueOn: DUE,
      mailedOn: null,
      refusedOn: null,
      citation: 'Vellmora Permit Act 4',
    })
  })

  it('reports the mailed date once a notice is recorded', async () => {
    const { applicationId } = await clockedApp('decided')
    await record(applicationId, '2027-03-15')
    const view = await staffView(applicationId)
    expect(view?.decisionNotice).toMatchObject({ mailedOn: '2027-03-15', refusedOn: null })
  })

  it('reports the refusal date after a refusal and labels the portal record', async () => {
    const { applicationId } = await clockedApp()
    await sweep(DAY_AFTER)
    const view = await staffView(applicationId)
    expect(view?.decisionNotice).toMatchObject({
      dueOn: DUE,
      mailedOn: null,
      refusedOn: DAY_AFTER,
    })
    const portal = await getPortalApplicationView(handle.db, world.applicant, applicationId, signal)
    expect(portal.ok && portal.value.stateLabel).toBe('Refused by operation of law')
  })

  it('leaves an ordinary denial labelled Denied on the portal', async () => {
    const { applicationId } = await clockedApp()
    await handle.db
      .update(applications)
      .set({ state: 'denied' })
      .where(eq(applications.id, applicationId))
    const portal = await getPortalApplicationView(handle.db, world.applicant, applicationId, signal)
    expect(portal.ok && portal.value.stateLabel).toBe('Denied')
  })

  it('is null for an application whose rules have no refusal consequence', async () => {
    setActivePackForTest(XX_PACK)
    const { applicationId } = await clockedApp()
    expect((await staffView(applicationId))?.decisionNotice).toBeNull()
  })
})

describe('under the New Hampshire pack', () => {
  beforeEach(() => {
    setActivePackForTest(null)
  })

  it('never fires, and deciding still marks the building decision clock met', async () => {
    const app = await makeApplication(handle.db, world, { state: 'under_review' })
    await handle.db.transaction((tx) =>
      startClocksFor(tx, app.applicationId, 'application_completed', STARTED, signal),
    )
    expect(await sweep(d('2027-06-01'))).toEqual({ refused: [], noticeOverdue: [] })
    await signedOffReview(handle.db, world, app.applicationId, signal)
    const row = await appOf(app.applicationId)
    const decided = await handle.db.transaction((tx) =>
      transitionApplication(
        tx,
        world.staff,
        {
          applicationId: app.applicationId,
          to: 'decided',
          expectedRowVersion: row?.rowVersion ?? 0,
          onDate: d('2027-03-10'),
        },
        signal,
        NOW,
      ),
    )
    expect(decided.ok).toBe(true)
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app.applicationId))
    expect(rows.find((c) => c.ruleKey === 'nh.bp.decision')?.status).toBe('met')
  })

  it('has no decision notice field on the staff view', async () => {
    const app = await makeApplication(handle.db, world, { state: 'under_review' })
    const view = await getStaffApplicationView(
      handle.db,
      world.staff,
      app.applicationId,
      NOW,
      signal,
    )
    expect(view?.decisionNotice).toBeNull()
  })
})

const CITATION = {
  label: 'Vellmora Permit Act 21',
  url: 'https://laws.example/vellmora/permit-act',
}

function windowRule(key: string, label: string): ClockRule {
  return {
    kind: 'clock',
    key,
    version: 1,
    label,
    citation: CITATION,
    clockType: 'filing_window',
    whose: 'third_party',
    startEvent: 'administrative_decision',
    length: { unit: 'days', value: 30 },
    direction: 'after',
    consequence: { kind: 'appeal_untimely', text: 'The filing is late.' },
    extension: { allowed: false, note: 'The act provides no extension.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  }
}

describe('the appeal route after a refusal by silence', () => {
  it('chooses the route for a denied administrative decision', async () => {
    const general = windowRule('xx.appeal.admin_general', 'Appeal of an administrative decision')
    const refused = windowRule('xx.appeal.admin_refused', 'Appeal of a refusal')
    const routes: AppealRoute[] = [
      {
        from: 'administrative_decision',
        to: 'zba_appeal',
        windowRuleKey: general.key,
        citation: CITATION,
      },
      {
        from: 'administrative_decision',
        when: { outcome: 'denied', label: 'refused' },
        to: 'court_petition',
        windowRuleKey: refused.key,
        citation: CITATION,
      },
    ]
    const rules = [...refusingRules, general, refused]
    setActivePackForTest(
      xxPackWith({
        manifest: { rules },
        pack: { ruleAreas: [{ title: 'All rules', rules }], appealRoutes: routes },
      }),
    )
    const { applicationId } = await clockedApp()
    expect((await sweep(DAY_AFTER)).refused).toEqual([applicationId])
    const [node] = await loadGraphNodeRows(handle.db, applicationId)
    if (node === undefined) throw new Error('missing refusal node')
    expect((await nodeWindow(handle.db, node, signal))?.label).toBe('Appeal of a refusal')
  })
})
