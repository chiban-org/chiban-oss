import {
  ClockRuleSchema,
  CodeEditionEntrySchema,
  EffectRuleSchema,
  GateRuleSchema,
  ListAgeRuleSchema,
  ProceedingClassificationSchema,
  ProximityRuleSchema,
  RecordRuleSchema,
  RecordSeriesSchema,
  TownSettingRuleSchema,
} from '@packs/nh/schema'
import { describe, expect, it } from 'vitest'
import { FIELD_PROBES } from '@/features/packs/fieldProbes'
import { leafPaths } from '@/features/packs/schemaPaths'

const KIND_SCHEMAS = {
  clock: ClockRuleSchema,
  gate: GateRuleSchema,
  required_record: RecordRuleSchema,
  effect: EffectRuleSchema,
  town_setting: TownSettingRuleSchema,
  list_age: ListAgeRuleSchema,
  proximity: ProximityRuleSchema,
  classification: ProceedingClassificationSchema,
  code_edition: CodeEditionEntrySchema,
  record_series: RecordSeriesSchema,
} as const

const DISCRIMINATOR = 'kind'

function declaredFields(): string[] {
  return Object.entries(KIND_SCHEMAS).flatMap(([kind, schema]) =>
    leafPaths(schema)
      .filter((p) => p !== DISCRIMINATOR || kind === 'classification')
      .map((p) => `${kind}.${p}`),
  )
}

describe('pack field consumers', () => {
  it('walks every declared field of every rule kind, classification, and code edition', () => {
    const fields = declaredFields()
    expect(fields).toEqual(
      expect.arrayContaining([
        'clock.length.value',
        'clock.consequence.text',
        'clock.extension.allowed',
        'gate.appliesTo',
        'town_setting.overridePolicy.default',
        'classification.mandatoryRuleKeys',
        'code_edition.electionWindow.until',
        'code_edition.components.code',
      ]),
    )
  })

  it('every declared pack field has a probe', () => {
    const missing = declaredFields().filter((f) => FIELD_PROBES[f] === undefined)
    expect(missing, `fields with no probe: ${missing.join(', ')}`).toEqual([])
  })

  it('every probe names a declared pack field', () => {
    const declared = new Set(declaredFields())
    const stale = Object.keys(FIELD_PROBES).filter((f) => !declared.has(f))
    expect(stale, `probes for fields that do not exist: ${stale.join(', ')}`).toEqual([])
  })

  it.each(
    Object.keys(FIELD_PROBES),
  )('every declared pack field changes an engine outcome: %s', (field) => {
    const probe = FIELD_PROBES[field]
    if (probe === undefined) throw new Error(`no probe for ${field}`)
    const { before, after } = probe.run()
    expect(after, `changing ${field} did not change any engine outcome`).not.toEqual(before)
  })
})
