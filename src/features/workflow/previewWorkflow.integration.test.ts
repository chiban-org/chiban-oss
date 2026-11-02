import { count } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, auditLog, clocks, configVersions, noticeItems } from '@/db/schema'
import { saveDraft } from '@/features/config/store'
import { previewWorkflow, type WorkflowPreview } from '@/features/workflow/previewWorkflow'
import { type BoardWorld, boardTypeBody, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const FACTS = { classification: null, dwellingUnits: null, afterTheFact: false }
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function draft(
  classification: 'nh.pb_site_plan' | 'nh.zba_variance' = 'nh.pb_site_plan',
  mutate: (body: ReturnType<typeof boardTypeBody>) => ReturnType<typeof boardTypeBody> = (b) => b,
) {
  const key = classification === 'nh.pb_site_plan' ? 'SPR' : 'VAR'
  const saved = await saveDraft(
    handle.db,
    world.admin,
    { kind: 'application_type', key, body: mutate(boardTypeBody(classification, key, key)) },
    signal,
  )
  if (!saved.ok) throw new Error('draft failed')
  return saved.value.versionId
}

async function preview(
  versionId: string,
  overrides: { regionalImpact?: boolean; meeting?: string } = {},
  actor = world.admin,
): Promise<WorkflowPreview> {
  const result = await previewWorkflow(
    handle.db,
    actor,
    {
      versionId,
      sampleFacts: { ...FACTS, regionalImpact: overrides.regionalImpact ?? false },
      sampleDates: {
        received: d('2027-03-24'),
        accepted: d('2027-04-14'),
        meeting: d(overrides.meeting ?? '2027-04-14'),
      },
    },
    signal,
  )
  if (!result.ok) throw new Error(`preview: ${result.error}`)
  return result.value
}

const allClocks = (p: WorkflowPreview) => p.steps.flatMap((s) => s.clocks)

describe('previewWorkflow', () => {
  it('preview of SPR with acceptance 2027-04-14 shows nh.pb.decision due 2027-06-18', async () => {
    const result = await preview(await draft())
    expect(allClocks(result).find((c) => c.ruleKey === 'nh.pb.decision')?.due).toBe('2027-06-18')
  })

  it('preview with regional impact shows 2027-07-18', async () => {
    const result = await preview(await draft(), { regionalImpact: true })
    expect(allClocks(result).find((c) => c.ruleKey === 'nh.pb.decision')?.due).toBe('2027-07-18')
  })

  it('every clock carries its consequence in words', async () => {
    const result = await preview(await draft())
    const decision = allClocks(result).find((c) => c.ruleKey === 'nh.pb.decision')
    expect(decision?.consequence).toContain('RSA 676:4')
    expect(
      allClocks(result).every((c) => c.consequence !== '' && !c.consequence.includes('_')),
    ).toBe(true)
  })

  it('walks the core path in order with the draft substeps under their states', async () => {
    const result = await preview(await draft())
    expect(result.steps.map((s) => s.state)).toEqual([
      'draft',
      'submitted',
      'under_review',
      'decided',
      'issued',
      'closed',
    ])
    const underReview = result.steps.find((s) => s.state === 'under_review')
    expect(underReview?.substeps.map((s) => s.label)).toEqual(['Hearing', 'Deliberation'])
  })

  it('shows the notices a hearing on the meeting date would need', async () => {
    const result = await preview(await draft())
    const notices = result.steps.flatMap((s) => s.notices)
    expect(notices.find((n) => n.requirementKey === 'nh.pb.notice_req.mail')).toMatchObject({
      channel: 'Verified mail',
      due: '2027-04-04',
    })
  })

  it('regional impact adds the certified notice', async () => {
    const result = await preview(await draft(), { regionalImpact: true })
    const notices = result.steps.flatMap((s) => s.notices)
    expect(notices.find((n) => n.requirementKey === 'nh.ri.notice_req.certified')?.due).toBe(
      '2027-03-31',
    )
  })

  it('lists gates for the states they apply to', async () => {
    const result = await preview(await draft())
    expect(result.steps.find((s) => s.state === 'under_review')?.gates.length).toBeGreaterThan(0)
    expect(result.steps.every((s) => s.gates.every((g) => g.label !== g.key))).toBe(true)
  })

  it('reports workflow issues alongside the preview', async () => {
    const result = await preview(
      await draft('nh.zba_variance', (b) => ({
        ...b,
        workflow: {
          ...b.workflow,
          substeps: b.workflow.substeps.filter((s) => s.key !== 'hearing'),
        },
      })),
    )
    expect(result.issues).toEqual([
      { code: 'missing_required_substep', state: 'under_review', key: 'hearing' },
    ])
  })

  it('preview writes no rows', async () => {
    const versionId = await draft()
    const tally = async () => ({
      applications: (await handle.db.select({ n: count() }).from(applications))[0]?.n,
      clocks: (await handle.db.select({ n: count() }).from(clocks))[0]?.n,
      notices: (await handle.db.select({ n: count() }).from(noticeItems))[0]?.n,
      audit: (await handle.db.select({ n: count() }).from(auditLog))[0]?.n,
      versions: (await handle.db.select({ n: count() }).from(configVersions))[0]?.n,
    })
    const before = await tally()
    await preview(versionId)
    expect(await tally()).toEqual(before)
  })

  it('a published version is not_draft', async () => {
    const [published] = await handle.db.select().from(configVersions)
    const result = await previewWorkflow(
      handle.db,
      world.admin,
      { versionId: published?.id ?? '', sampleDates: { received: d('2027-03-24') } },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'not_draft' })
  })

  it('a draft of another kind is not_draft', async () => {
    const saved = await saveDraft(
      handle.db,
      world.admin,
      {
        kind: 'regional_contacts',
        key: 'default',
        body: { key: 'default', commission: null, municipalities: [], nhDes: null },
      },
      signal,
    )
    if (!saved.ok) throw new Error('save failed')
    const result = await previewWorkflow(
      handle.db,
      world.admin,
      { versionId: saved.value.versionId, sampleDates: { received: d('2027-03-24') } },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'not_draft' })
  })

  it('staff without config.edit previewing is forbidden', async () => {
    const reviewer = await staffActor(handle.db, 'reviewer')
    const result = await previewWorkflow(
      handle.db,
      reviewer,
      { versionId: await draft(), sampleDates: { received: d('2027-03-24') } },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })
})
