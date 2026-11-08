import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import { NH_CODE_EDITIONS } from '@packs/nh/codeEditions'
import { NH_PACK_MANIFEST } from '@packs/nh/manifest'
import { PackManifestSchema, PackRuleSchema } from '@packs/nh/schema'
import { describe, expect, it } from 'vitest'
import { resolveCodeEdition } from '@/features/building/codeEdition'
import { loadPack } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'
import { todayInTimeZone } from '@/types/civilDate'

describe('nh pack', () => {
  it('nh pack validates', () => {
    expect(PackManifestSchema.safeParse(NH_PACK_MANIFEST).success).toBe(true)
    expect(loadPack().id).toBe('nh')
  })

  it('every rule has a citation label and a url except town. rules', () => {
    for (const rule of NH_PACK_MANIFEST.rules) {
      expect(rule.citation.label.length).toBeGreaterThan(0)
      if (rule.key.startsWith('town.')) {
        expect(rule.citation).toEqual({ label: 'Town rule', url: null })
      } else {
        expect(rule.citation.url).toMatch(/^https:\/\//)
      }
    }
  })

  it('every mandatory rule key exists', () => {
    const keys = new Set(NH_PACK_MANIFEST.rules.map((r) => r.key))
    for (const c of NH_CLASSIFICATIONS) {
      for (const k of c.mandatoryRuleKeys) expect(keys.has(k)).toBe(true)
    }
  })

  it('before-direction requires notice_lead or filing_window', () => {
    const base = NH_PACK_MANIFEST.rules.find((r) => r.key === 'nh.bp.regional_impact_comment')
    expect(base?.kind).toBe('clock')
    const bad = { ...base, direction: 'before', clockType: 'action_due' }
    expect(PackRuleSchema.safeParse(bad).success).toBe(false)
    const good = { ...base, direction: 'before', clockType: 'notice_lead' }
    expect(PackRuleSchema.safeParse(good).success).toBe(true)
  })

  it('a manifest naming a mandatory rule that does not exist is rejected', () => {
    const broken = {
      ...NH_PACK_MANIFEST,
      classifications: [
        {
          key: 'nh.trade_permit',
          label: 'Trade',
          mandatoryRuleKeys: ['nope'],
          board: null,
          abutters: null,
        },
      ],
    }
    expect(PackManifestSchema.safeParse(broken).success).toBe(false)
  })

  it('every NH_CODE_EDITIONS entry has a citation url', () => {
    for (const e of NH_CODE_EDITIONS) expect(e.citation.url).toMatch(/^https:\/\//)
  })

  it('NH_CODE_EDITIONS is non-empty and has an entry effective on or before today', () => {
    const today = todayInTimeZone('America/New_York', new Date())
    expect(NH_CODE_EDITIONS.length).toBeGreaterThan(0)
    expect(NH_CODE_EDITIONS.some((e) => e.effectiveFrom <= today)).toBe(true)
  })

  it('the period before 2024-07-01 is explicitly unverified and the adopted edition is verified', () => {
    const before = NH_CODE_EDITIONS.find((e) => e.status === 'unverified')
    const current = NH_CODE_EDITIONS.find((e) => e.effectiveFrom === '2024-07-01')
    expect(before?.components).toEqual([])
    expect(before?.label).toMatch(/not verified/i)
    expect(current?.status).toBe('verified')
    expect(current?.enforcementFrom).toBe('2025-01-01')
    expect(current?.components.map((c) => `${c.code} ${c.edition}`)).toEqual([
      'IBC 2021',
      'IEBC 2021',
      'IPC 2021',
      'IMC 2021',
      'IECC 2018',
      'IRC 2021',
      'ISPSC 2021',
      'NEC 2023',
    ])
    expect(current?.amendmentPackages.map((p) => p.effectiveFrom)).toEqual([
      '2025-07-01',
      '2025-10-15',
    ])
  })

  it('adopts the 2024 ICC codes for applications received on or after 2026-07-01', () => {
    const edition = NH_CODE_EDITIONS.find((e) => e.effectiveFrom === '2026-07-01')
    expect(edition?.status).toBe('verified')
    expect(edition?.components.map((c) => `${c.code} ${c.edition}`)).toEqual([
      'IBC 2024',
      'IEBC 2024',
      'IPC 2024',
      'IMC 2024',
      'IECC 2018',
      'ISPSC 2024',
      'IRC 2024',
      'NEC 2023',
    ])
    expect(edition?.citation.url).toBe('https://gc.nh.gov/rsa/html/XII/155-A/155-A-1.htm')
  })

  it('picks the edition by the date the application was received', () => {
    const keyOn = (date: string) => {
      const resolved = resolveCodeEdition(NH_CODE_EDITIONS, date as CivilDate)
      return resolved.ok ? resolved.value.editionKey : resolved.error
    }
    expect(keyOn('2026-06-30')).toBe('nh.edition.2024_07_01')
    expect(keyOn('2026-07-01')).toBe('nh.edition.2026_07_01')
  })
})
