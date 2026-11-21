import { describe, expect, it } from 'vitest'
import { resolveCodeEdition } from '@/features/building/codeEdition'
import { buildingProgramIssues } from '@/features/buildingProgram/checks'
import type { BuildingProgramBody } from '@/features/buildingProgram/schema'
import { loadPack } from '@/features/packs/loadPack'
import { activePack, packById, withPackForTest } from '@/features/packs/registry'
import { PackManifestSchema } from '@/features/packs/schema'
import { addDays, type CivilDate } from '@/types/civilDate'
import { ME_ABUTTER_PARAMS } from './abutters/params'
import { ME_CODE_EDITIONS } from './codeEditions'
import { ME_PACK } from './index'
import { ME_PACK_MANIFEST } from './manifest'

const MAINE_HOSTS = new Set(['legislature.maine.gov', 'www.maine.gov', 'www.courts.maine.gov'])

describe('me pack', () => {
  it('validates and loads through the registry', () => {
    const parsed = PackManifestSchema.safeParse(ME_PACK_MANIFEST)
    expect(parsed.error?.issues ?? []).toEqual([])
    withPackForTest(ME_PACK, () => {
      expect(loadPack().id).toBe('me')
      expect(loadPack().version).toBe('0.9.0')
    })
  })

  it('resolves by id from the registry', () => {
    expect(packById('me')).toBe(ME_PACK)
    expect(packById('me').docsSlug).toBe('maine')
  })

  it('cites a Maine https url on every rule except town rules', () => {
    for (const rule of ME_PACK_MANIFEST.rules) {
      if (rule.key.startsWith('town.')) {
        expect(rule.citation).toEqual({ label: 'Town rule', url: null })
        continue
      }
      const url = new URL(rule.citation.url ?? '')
      expect(url.protocol).toBe('https:')
      expect(MAINE_HOSTS.has(url.host)).toBe(true)
    }
  })

  it('labels every town setting as a Chiban starting value', () => {
    const settings = ME_PACK_MANIFEST.rules.filter((r) => r.kind === 'town_setting')
    expect(settings.length).toBeGreaterThan(0)
    for (const s of settings) expect(s.label.endsWith('(Chiban starting value)')).toBe(true)
  })

  it('treats no written decision within 30 days of filing as a refused permit', () => {
    const rule = ME_PACK_MANIFEST.rules.find((r) => r.key === 'me.bp.decision')
    if (rule?.kind !== 'clock') throw new Error('not a clock')
    expect(rule.startEvent).toBe('application_received')
    expect(rule.length).toEqual({ unit: 'days', value: 30 })
    expect(rule.consequence.kind).toBe('deemed_refused')
    expect(rule.citation.label).toBe('30-A MRSA §4103(3)')
  })

  it('states hearing and recording on the building permit classification', () => {
    const bp = ME_PACK_MANIFEST.classifications.find((c) => c.key === 'me.building_permit')
    expect(bp?.hearing).toBe('required')
    expect(bp?.recordingRequired).toBe(false)
    expect(ME_PACK.classificationKeys).toEqual(ME_PACK_MANIFEST.classifications.map((c) => c.key))
  })

  it('uses Maine names and wording throughout', () => {
    const text = JSON.stringify(ME_PACK)
    const terms = [/\bRSA\b/, /\bZBA\b/, /selectmen/i, /Right-to-Know/i, /\bNH\b/, /New Hampshire/]
    expect(terms.filter((term) => term.test(text)).map(String)).toEqual([])
    expect(ME_PACK.boardKinds.zba).toMatchObject({
      label: 'Board of Appeals',
      shortLabel: 'Board of Appeals',
      abbreviation: 'BOA',
    })
    expect(ME_PACK.boardKinds.planning_board.label).toBe('Planning Board')
    const help = ME_PACK.labels.significantDecisionHelp ?? ''
    for (const part of [
      '30-A MRSA §4481(1)',
      'chapter 187, subchapter 3',
      'section 489-A',
      '10,000 square feet of ground area',
      '40,000 square feet of floor area',
      'not revegetated',
      '10 or more lots',
    ]) {
      expect(help).toContain(part)
    }
  })

  it('reads map and lot as free text', () => {
    expect(ME_PACK.parcelIdFormats).toEqual([
      {
        key: 'map_lot',
        label: 'Map and lot',
        kind: 'free_text',
        width: null,
        isDisplay: true,
        example: 'R04-012',
      },
    ])
  })

  it('keys abutter params by the strategy and has no capture radius', () => {
    expect(ME_ABUTTER_PARAMS.key).toBe('me.adjacent_buffer.v1')
    expect(ME_ABUTTER_PARAMS.captureRadiusFt).toBeNull()
    expect(ME_ABUTTER_PARAMS.townBuffer).toEqual({ defaultFt: null, maxFt: 1000 })
    expect(ME_ABUTTER_PARAMS.tolerancesLabel).toContain('(Chiban limit)')
    expect(ME_ABUTTER_PARAMS.citation.label).toBe('30-A MRSA §4403(3)(A)')
  })

  it('refuses a building program over 4000 residents that does not enforce MUBEC', () => {
    withPackForTest(ME_PACK, () => {
      const codes = activePack().buildingCodes
      const refusal = [
        'codeChoice: towns over 4000 residents must enforce Maine Uniform Building and Energy Code',
      ]
      const body = (codeChoice: string | null, residents: number): BuildingProgramBody => ({
        key: 'default',
        permitsEnabled: true,
        codeChoice,
        residents,
      })
      expect(buildingProgramIssues(body('me.code.mubc', 4001), codes)).toEqual(refusal)
      expect(buildingProgramIssues(body(null, 4001), codes)).toEqual(refusal)
      expect(buildingProgramIssues(body('me.code.mubec', 4001), codes)).toEqual([])
      expect(buildingProgramIssues(body('me.code.mubc', 4000), codes)).toEqual([])
      expect(buildingProgramIssues(body(null, 4000), codes)).toEqual([])
    })
  })

  it('picks the MUBEC edition by the date the application was received', () => {
    const keyOn = (date: string) => {
      const resolved = resolveCodeEdition(ME_CODE_EDITIONS, date as CivilDate)
      return resolved.ok ? resolved.value.editionKey : resolved.error
    }
    expect(keyOn('2018-01-22')).toBe('no_edition_for_date')
    expect(keyOn('2018-01-23')).toBe('me.edition.2018_01_23')
    expect(keyOn('2025-04-06')).toBe('me.edition.2018_01_23')
    expect(keyOn('2025-04-07')).toBe('me.edition.2025_04_07')
    const current = ME_CODE_EDITIONS.find((e) => e.key === 'me.edition.2025_04_07')
    expect(current?.status).toBe('verified')
    expect(current?.components.map((c) => `${c.code} ${c.edition}`)).toEqual([
      'IBC 2021',
      'IRC 2021',
      'IEBC 2021',
      'IECC 2021',
      'IMC 2021',
      'ASHRAE 62.1 2019',
      'ASHRAE 62.2 2019',
      'ASHRAE 90.1 2019',
    ])
    const previous = ME_CODE_EDITIONS.find((e) => e.key === 'me.edition.2018_01_23')
    expect(previous?.enforcementFrom).toBe(addDays('2018-01-23' as CivilDate, 90))
    expect(previous?.amendmentPackages).toEqual([
      { effectiveFrom: '2021-05-10', label: 'IECC 2015 and IMC 2015 effective 2021-05-10' },
    ])
    expect(current?.citation.label).toContain('08-003 CMR ch 2 (formerly 16-642 CMR ch 1)')
    expect(current?.citation.url).toBe(
      'https://www.maine.gov/dps/fmo/sites/maine.gov.dps.fmo/files/inline-files/MUBEC%20Standards%20and%20Amendments.pdf',
    )
  })
})
