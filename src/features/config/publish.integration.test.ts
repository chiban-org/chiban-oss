import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog } from '@/db/schema'
import { amendmentsInForce, effectiveBindings } from '@/features/config/bindings'
import { publishConfig, rollbackConfig } from '@/features/config/publish'
import { saveDraft } from '@/features/config/store'
import { loadPack } from '@/features/packs/loadPack'
import {
  appTypeBody,
  FEE_BODY,
  FORM_BODY,
  insertPublishedDirect,
  MANDATORY_BP_BINDINGS,
  publishBuildingSupport,
  saveAndPublish,
  TEMPLATE_BODY,
} from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function publishResult(
  kind: Parameters<typeof saveDraft>[2]['kind'],
  key: string,
  body: unknown,
) {
  const admin = await staffActor(handle.db, 'admin')
  const saved = await saveDraft(handle.db, admin, { kind, key, body }, signal)
  if (!saved.ok) return saved
  return await publishConfig(handle.db, admin, saved.value.versionId, signal)
}

describe('publish checks', () => {
  it('application type without a classification is rejected', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await publishBuildingSupport(handle.db, admin)
    const { classification: _omit, ...rest } = appTypeBody()
    const r = await publishResult('application_type', 'BP', rest)
    expect(r).toEqual({ ok: false, error: { missingClassification: true } })
  })

  it('application type missing nh.bp.decision is rejected with missingBindings', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await publishBuildingSupport(handle.db, admin)
    const bindings = MANDATORY_BP_BINDINGS.filter((b) => b !== 'nh.bp.decision')
    const r = await publishResult('application_type', 'BP', appTypeBody({ bindings }))
    expect(r).toEqual({ ok: false, error: { missingBindings: ['nh.bp.decision'] } })
  })

  it('application type naming a rule outside the pack is rejected', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await publishBuildingSupport(handle.db, admin)
    const r = await publishResult(
      'application_type',
      'BP',
      appTypeBody({ bindings: [...MANDATORY_BP_BINDINGS, 'nh.nope'] }),
    )
    expect(r).toEqual({ ok: false, error: { unknownBindings: ['nh.nope'] } })
  })

  it('application type referencing unpublished configuration is rejected', async () => {
    const r = await publishResult('application_type', 'BP', appTypeBody())
    expect(r.ok).toBe(false)
    if (!r.ok && typeof r.error === 'object') {
      expect('missingReferences' in r.error && r.error.missingReferences).toEqual(
        expect.arrayContaining(['form:bp-form', 'fee_schedule:bp-fees']),
      )
    }
  })

  it('fee line naming a field the form lacks is rejected as unknownFieldRefs', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await publishBuildingSupport(handle.db, admin)
    await saveAndPublish(handle.db, admin, 'fee_schedule', 'bp-fees', {
      ...FEE_BODY,
      lines: [
        {
          ...FEE_BODY.lines[0],
          expr: { op: 'per_unit', source: { kind: 'field', field: 'ghost' }, centsPerUnit: 1 },
        },
      ],
    })
    const r = await publishResult('application_type', 'BP', appTypeBody())
    expect(r).toEqual({ ok: false, error: { unknownFieldRefs: ['ghost'] } })
  })

  it('a template with an unknown merge field is rejected', async () => {
    const r = await publishResult('template', 'bad', {
      ...TEMPLATE_BODY,
      key: 'bad',
      body: '{{nope}}',
    })
    expect(r).toEqual({ ok: false, error: { unknownMergeFields: ['nope'] } })
  })

  it('town rule setting for town.bp.validity without adoption record is rejected', async () => {
    const r = await publishResult('town_rule_setting', 'town.bp.validity', {
      ruleKey: 'town.bp.validity',
      value: 18,
    })
    expect(r).toEqual({
      ok: false,
      error: {
        policyViolations: [{ ruleKey: 'town.bp.validity', error: 'adoption_record_missing' }],
      },
    })
  })

  it('town rule setting with an adoption record publishes', async () => {
    const r = await publishResult('town_rule_setting', 'town.bp.validity', {
      ruleKey: 'town.bp.validity',
      value: 18,
      adoptingAuthority: 'Select Board',
      adoptedOn: '2027-01-05',
    })
    expect(r.ok).toBe(true)
  })

  it('a fractional value for a month or day setting is rejected', async () => {
    const r = await publishResult('town_rule_setting', 'town.bp.validity', {
      ruleKey: 'town.bp.validity',
      value: 1.5,
      adoptingAuthority: 'Select Board',
      adoptedOn: '2027-01-05',
    })
    expect(r.ok).toBe(false)
    if (!r.ok && typeof r.error === 'object') expect('invalid' in r.error).toBe(true)
  })

  it('setting a value for nh.code.technical_requirements is locally_prohibited', async () => {
    const r = await publishResult('town_rule_setting', 'nh.code.technical_requirements', {
      ruleKey: 'nh.code.technical_requirements',
      value: 1,
      adoptingAuthority: 'Select Board',
      adoptedOn: '2027-01-05',
    })
    expect(r).toEqual({
      ok: false,
      error: {
        policyViolations: [
          { ruleKey: 'nh.code.technical_requirements', error: 'locally_prohibited' },
        ],
      },
    })
  })

  it('a town rule setting for an unknown rule is invalid', async () => {
    const r = await publishResult('town_rule_setting', 'x', { ruleKey: 'nope', value: 1 })
    expect(r.ok).toBe(false)
  })
})

describe('rollback', () => {
  it('rollback to a version missing a mandatory binding is rejected', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await publishBuildingSupport(handle.db, admin)
    const weak = appTypeBody({ bindings: ['nh.appeal.suspension'] })
    await insertPublishedDirect(handle.db, admin, {
      kind: 'application_type',
      key: 'BP',
      version: 1,
      body: weak,
    })
    await saveAndPublish(handle.db, admin, 'application_type', 'BP', appTypeBody())
    const r = await rollbackConfig(
      handle.db,
      admin,
      { kind: 'application_type', key: 'BP', toVersion: 1 },
      signal,
    )
    expect(r.ok).toBe(false)
    if (!r.ok && typeof r.error === 'object') expect('missingBindings' in r.error).toBe(true)
  })

  it('rollback copies an old body into a new published version and audits it', async () => {
    const admin = await staffActor(handle.db, 'admin')
    await saveAndPublish(handle.db, admin, 'form', 'bp-form', FORM_BODY)
    await saveAndPublish(handle.db, admin, 'form', 'bp-form', { ...FORM_BODY, label: 'Newer' })
    const r = await rollbackConfig(
      handle.db,
      admin,
      { kind: 'form', key: 'bp-form', toVersion: 1 },
      signal,
    )
    expect(r).toEqual({ ok: true, value: { version: 3 } })
    const rows = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'config.rollback'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.before).toMatchObject({ version: 2 })
    expect(rows[0]?.after).toMatchObject({ version: 3, rolledBackFrom: 1 })
  })

  it('rollback to a missing version is no_such_version and staff is forbidden', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const staff = await staffActor(handle.db, 'staff')
    expect(
      await rollbackConfig(handle.db, admin, { kind: 'form', key: 'zz', toVersion: 9 }, signal),
    ).toEqual({ ok: false, error: 'no_such_version' })
    expect(
      await rollbackConfig(handle.db, staff, { kind: 'form', key: 'zz', toVersion: 9 }, signal),
    ).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('bindings and amendments', () => {
  it('effective bindings always include the classification mandatory rules', () => {
    const stored = appTypeBody({ bindings: [] })
    const effective = effectiveBindings(stored, loadPack())
    for (const k of MANDATORY_BP_BINDINGS) expect(effective).toContain(k)
  })

  it('effective bindings add the type declared extras once', () => {
    const stored = appTypeBody({ bindings: [...MANDATORY_BP_BINDINGS] })
    const effective = effectiveBindings(stored, loadPack())
    expect(effective.length).toBe(new Set(effective).size)
  })

  it('unconfirmed local amendment is not in force', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const base = {
      title: 'Local stair rule',
      codeSection: 'R311',
      adoptingAuthority: 'Select Board',
      adoptedOn: '2027-01-05',
    }
    await saveAndPublish(handle.db, admin, 'local_code_amendment', 'stairs', {
      ...base,
      reviewBoardConfirmedOn: null,
    })
    await saveAndPublish(handle.db, admin, 'local_code_amendment', 'rails', {
      ...base,
      title: 'Local rail rule',
      reviewBoardConfirmedOn: '2027-03-01',
    })
    const early = await amendmentsInForce(handle.db, '2027-02-01' as CivilDate, signal)
    expect(early).toEqual([])
    const later = await amendmentsInForce(handle.db, '2027-03-01' as CivilDate, signal)
    expect(later.map((a) => a.title)).toEqual(['Local rail rule'])
  })
})
