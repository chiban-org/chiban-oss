import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkOverlayAgainstStarters,
  noticeFeesFor,
  parseDemoOverlay,
  starterByTypeKey,
  typeEntry,
} from '@/features/demo/overlay/checkOverlay'
import type { DemoOverlay } from '@/features/demo/overlay/overlaySchema'
import { planType } from '@/features/demo/overlay/planType'

const EXAMPLE = path.resolve(import.meta.dirname, '../../../../docs/demo-overlay.example.json')

function example(): unknown {
  return JSON.parse(readFileSync(EXAMPLE, 'utf8'))
}

function parsed(json: unknown): DemoOverlay {
  const result = parseDemoOverlay(json)
  if (!result.ok) throw new Error(JSON.stringify(result.error))
  return result.value
}

function issuePaths(json: unknown): string[] {
  const result = parseDemoOverlay(json)
  if (!result.ok) return result.error.map((i) => i.path)
  return checkOverlayAgainstStarters(result.value).issues.map((i) => i.path)
}

function starter(key: string) {
  const found = starterByTypeKey(key)
  if (found === undefined) throw new Error(`no starter ${key}`)
  return found
}

const flat = (cents: number) => ({ op: 'flat', cents })

describe('demo overlay format', () => {
  it('accepts the example overlay with nothing to report', () => {
    expect(checkOverlayAgainstStarters(parsed(example()))).toEqual({
      issues: [],
      notInstalled: [],
    })
  })

  it('names the exact path of an unknown key at any depth', () => {
    expect(issuePaths({ version: 1, colour: 'blue' })).toEqual([''])
    expect(issuePaths({ version: 1, townProfile: { fax: '603' } })).toEqual(['townProfile'])
    expect(
      issuePaths({
        version: 1,
        starters: ['BP'],
        applicationTypes: { BP: { fees: { building: { expr: flat(1), note: 'x' } } } },
      }),
    ).toEqual(['applicationTypes.BP.fees.building'])
  })

  it('refuses unknown keys inside fee expressions and form fields instead of dropping them', () => {
    const field = {
      key: 'sign_duration',
      label: 'Temporary or permanent sign',
      type: 'text',
      required: false,
      requireIF: { field: 'illuminated', op: 'is_true' },
    }
    expect(
      issuePaths({
        version: 1,
        starters: ['SG'],
        applicationTypes: { SG: { formFields: [field] } },
      }),
    ).toEqual(['applicationTypes.SG.formFields.0.requireIF'])
    const expr = { op: 'sum', of: [{ op: 'flat', cents: 100, centz: 5 }] }
    expect(
      issuePaths({
        version: 1,
        starters: ['BP'],
        applicationTypes: { BP: { fees: { building: { expr } } } },
      }),
    ).toEqual(['applicationTypes.BP.fees.building.expr.of.0.centz'])
  })

  it('refuses values the config validators refuse, at their path', () => {
    expect(
      issuePaths({
        version: 1,
        starters: ['BP'],
        applicationTypes: { BP: { fees: { building: { expr: flat(-5) } } } },
      }),
    ).toEqual(['applicationTypes.BP.fees.building.expr.cents'])
    expect(issuePaths({ version: 1, townProfile: { website: 'alderpond' } })).toEqual([
      'townProfile.website',
    ])
    expect(issuePaths({ version: 2 })).toEqual(['version'])
  })

  it('requires every configured type to be listed in starters, once', () => {
    expect(
      issuePaths({
        version: 1,
        applicationTypes: { VAR: { fees: { application: { expr: flat(1) } } } },
      }),
    ).toEqual(['applicationTypes.VAR'])
    expect(issuePaths({ version: 1, starters: ['BP', 'BP'] })).toEqual(['starters.1'])
  })

  it('reports starters this build does not have and skips their entries', () => {
    const overlay = parsed({
      version: 1,
      starters: ['BP', 'QQ'],
      applicationTypes: { QQ: { fees: { qq: { label: 'Q', due: 'at_intake', expr: flat(0) } } } },
    })
    expect(checkOverlayAgainstStarters(overlay)).toEqual({ issues: [], notInstalled: ['QQ'] })
  })

  it('needs a label and a due stage to add a fee line the schedule does not have', () => {
    const add = { expr: flat(100) }
    expect(
      issuePaths({
        version: 1,
        starters: ['BP'],
        applicationTypes: { BP: { fees: { copies: add } } },
      }),
    ).toEqual(['applicationTypes.BP.fees.copies'])
  })

  it('refuses a fee that reads a field the form does not have as a number', () => {
    const perUnit = (field: string) => ({
      op: 'per_unit',
      source: { kind: 'field', field },
      centsPerUnit: 10,
    })
    const multiplier = {
      op: 'conditional_multiplier',
      when: { field: 'no_such_field', op: 'is_true' },
      factor: 2,
      of: flat(100),
    }
    const types = (expr: unknown) => ({ BP: { fees: { building: { expr } } } })
    for (const expr of [perUnit('description'), perUnit('no_such_field'), multiplier]) {
      expect(issuePaths({ version: 1, starters: ['BP'], applicationTypes: types(expr) })).toEqual([
        'applicationTypes.BP.fees.building.expr',
      ])
    }
  })

  it('refuses a new form field whose key the form already uses for something else', () => {
    const field = { key: 'description', label: 'Other', type: 'text', required: false }
    expect(
      issuePaths({
        version: 1,
        starters: ['SG'],
        applicationTypes: { SG: { formFields: [field] } },
      }),
    ).toEqual(['applicationTypes.SG.formFields.0.key'])
  })
})

describe('planType', () => {
  const overlay = parsed(example())

  function plan(key: string, input: { form?: unknown; fee?: unknown } = {}) {
    const s = starter(key)
    const result = planType({
      typeKey: key,
      entry: typeEntry(overlay, key),
      form: (input.form ?? s.form) as typeof s.form,
      fee: (input.fee ?? s.feeSchedule) as typeof s.feeSchedule,
      noticeFees: noticeFeesFor(overlay, s.applicationType.classification),
    })
    if (!result.ok) throw new Error(JSON.stringify(result.error))
    return result.value
  }

  it('sets the board notice fees and adds the advertising line where the starter has none', () => {
    const variance = plan('VAR').fee?.lines.map((l) => [l.code, l.expr])
    expect(variance).toEqual([
      ['application', flat(12500)],
      [
        'notice_mail',
        {
          op: 'per_unit',
          source: { kind: 'count_of', what: 'abutters_on_issued_list' },
          centsPerUnit: 900,
        },
      ],
      ['notice_newspaper', flat(8000)],
    ])
    const sitePlan = plan('SPR').fee?.lines.map((l) => l.code)
    expect(sitePlan).toEqual(['application', 'notice_mail', 'notice_newspaper'])
  })

  it('treats a field or line stored with its keys in another order as already applied', () => {
    const first = plan('SG')
    const reorder = <T extends object>(value: T): T =>
      Object.fromEntries(Object.entries(value).reverse()) as T
    const form = first.form && { ...first.form, fields: first.form.fields.map(reorder) }
    const fee = first.fee && { ...first.fee, lines: first.fee.lines.map(reorder) }
    expect(plan('SG', { form, fee })).toEqual({ form: null, fee: null })
  })

  it('adds new lines and form fields once, so a second pass changes nothing', () => {
    const first = plan('SG')
    expect(first.form?.fields.map((f) => f.key)).toContain('sign_duration')
    expect(plan('SG', { form: first.form, fee: first.fee })).toEqual({ form: null, fee: null })
    const building = plan('BP')
    expect(building.fee?.lines.map((l) => l.code)).toEqual(['building', 'renewal', 'plan_review'])
    expect(plan('BP', { fee: building.fee })).toEqual({ form: null, fee: null })
  })
})
