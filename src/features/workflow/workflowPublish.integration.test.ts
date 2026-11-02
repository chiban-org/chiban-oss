import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configVersions } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { publishConfig, rollbackConfig } from '@/features/config/publish'
import { saveDraft } from '@/features/config/store'
import {
  type BoardWorld,
  boardTypeBody,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

const HEARING = { state: 'under_review', key: 'hearing', label: 'Hearing' } as const
const FILED = { state: 'submitted', key: 'filed', label: 'Filed' } as const

async function publishType(
  key: string,
  classification: 'nh.zba_variance' | 'nh.pb_site_plan',
  workflow: Partial<ReturnType<typeof boardTypeBody>['workflow']>,
  actor = world.admin,
) {
  const base = boardTypeBody(classification, key, key === 'VAR' ? 'VAR' : 'SPR')
  const saved = await saveDraft(
    handle.db,
    actor,
    {
      kind: 'application_type',
      key,
      body: { ...base, workflow: { ...base.workflow, ...workflow } },
    },
    signal,
  )
  if (!saved.ok) return saved
  return await publishConfig(handle.db, actor, saved.value.versionId, signal)
}

describe('workflow validation on publish', () => {
  it('removing the hearing substep from VAR is missing_required_substep', async () => {
    const result = await publishType('VAR', 'nh.zba_variance', {
      substeps: [FILED, { state: 'under_review', key: 'deliberation', label: 'Deliberation' }],
    })
    expect(result).toEqual({
      ok: false,
      error: {
        workflowIssues: [
          { code: 'missing_required_substep', state: 'under_review', key: 'hearing' },
        ],
      },
    })
  })

  it('enabling direct issue on SPR is direct_issue_not_allowed', async () => {
    const result = await publishType('SPR', 'nh.pb_site_plan', { allowsDirectIssue: true })
    expect(result).toEqual({
      ok: false,
      error: { workflowIssues: [{ code: 'direct_issue_not_allowed' }] },
    })
  })

  it('a substep on closed is terminal_state_substep', async () => {
    const result = await publishType('VAR', 'nh.zba_variance', {
      substeps: [FILED, HEARING, { state: 'closed', key: 'archive', label: 'Archive' }],
    })
    expect(result).toMatchObject({
      ok: false,
      error: {
        workflowIssues: [{ code: 'terminal_state_substep', state: 'closed', key: 'archive' }],
      },
    })
  })

  it('a valid workflow still publishes', async () => {
    const result = await publishType('VAR', 'nh.zba_variance', {
      substeps: [FILED, HEARING, { state: 'under_review', key: 'site_walk', label: 'Site walk' }],
    })
    expect(result.ok).toBe(true)
  })

  it('rollback to a version that now lacks a required substep is rejected', async () => {
    await publishType('VAR', 'nh.zba_variance', { substeps: [FILED, HEARING] })
    const base = boardTypeBody('nh.zba_variance', 'VAR', 'VAR')
    await handle.db.insert(configVersions).values({
      kind: 'application_type',
      key: 'VAR',
      version: 99,
      status: 'superseded',
      body: { ...base, workflow: { ...base.workflow, substeps: [FILED] } },
      createdBy: world.admin.userId,
    })
    const result = await rollbackConfig(
      handle.db,
      world.admin,
      { kind: 'application_type', key: 'VAR', toVersion: 99 },
      signal,
    )
    expect(result).toMatchObject({
      ok: false,
      error: { workflowIssues: [{ code: 'missing_required_substep' }] },
    })
  })

  it('staff without config.edit publishing a workflow is forbidden', async () => {
    const reviewer = await staffActor(handle.db, 'reviewer')
    const base = boardTypeBody('nh.zba_variance', 'VAR', 'VAR')
    const saved = await saveDraft(
      handle.db,
      world.admin,
      { kind: 'application_type', key: 'VAR', body: base },
      signal,
    )
    if (!saved.ok) throw new Error('save failed')
    expect(await publishConfig(handle.db, reviewer, saved.value.versionId, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('an in-flight application keeps its pinned substeps after publish', async () => {
    const applicationId = await submitBoardApplication(
      handle.db,
      world,
      world.zbaTypeKey,
      '2027-03-02',
    )
    const before = await loadApplicationContext(handle.db, applicationId, signal)
    await saveAndPublish(
      handle.db,
      world.admin,
      'application_type',
      'VAR',
      (() => {
        const base = boardTypeBody('nh.zba_variance', 'VAR', 'VAR')
        return {
          ...base,
          workflow: {
            ...base.workflow,
            substeps: base.workflow.substeps.map((s) =>
              s.key === 'hearing' ? { ...s, label: 'Public hearing' } : s,
            ),
          },
        }
      })(),
    )
    const after = await loadApplicationContext(handle.db, applicationId, signal)
    const label = (ctx: typeof before) =>
      ctx?.typeBody.workflow.substeps.find((s) => s.key === 'hearing')?.label
    expect(label(before)).toBe('Hearing')
    expect(label(after)).toBe('Hearing')
  })
})
