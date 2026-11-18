import { afterEach, describe, expect, it } from 'vitest'
import { ErrorIds } from '@/constants/errorIds'
import { packCountingCitations, packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack } from '@/features/packs/loadPack'
import { packInfo } from '@/features/packs/packInfo'
import {
  activePack,
  packById,
  packIdFromEnv,
  setActivePackForTest,
  withPackForTest,
} from '@/features/packs/registry'
import { XX_PACK } from '@/test/packs/xx'
import type { CivilDate } from '@/types/civilDate'

afterEach(() => setActivePackForTest(null))

describe('pack registry', () => {
  it('defaults to nh when CHIBAN_PACK is unset or blank', () => {
    expect(packIdFromEnv({})).toBe('nh')
    expect(packIdFromEnv({ CHIBAN_PACK: '  ' })).toBe('nh')
    expect(packIdFromEnv({ CHIBAN_PACK: 'nh' })).toBe('nh')
  })

  it('reads the pack id from CHIBAN_PACK', () => {
    expect(packIdFromEnv({ CHIBAN_PACK: 'xx' })).toBe('xx')
  })

  it('returns the nh pack by default', () => {
    expect(activePack().manifest.id).toBe('nh')
  })

  it('rejects an unknown pack id with PACK_INVALID', () => {
    expect(() => packById('zz')).toThrowError(
      expect.objectContaining({ id: ErrorIds.PACK_INVALID }),
    )
  })

  it('selects the pack named by CHIBAN_PACK at run time', () => {
    const previous = process.env.CHIBAN_PACK
    process.env.CHIBAN_PACK = 'zz'
    setActivePackForTest(null)
    try {
      expect(() => activePack()).toThrowError(
        expect.objectContaining({ id: ErrorIds.PACK_INVALID }),
      )
    } finally {
      if (previous === undefined) delete process.env.CHIBAN_PACK
      else process.env.CHIBAN_PACK = previous
      setActivePackForTest(null)
    }
    expect(activePack().manifest.id).toBe('nh')
  })

  it('lets a test load another pack through the registry', () => {
    withPackForTest(XX_PACK, () => {
      expect(activePack()).toBe(XX_PACK)
      expect(loadPack().id).toBe('xx')
      expect(loadPack().rules.map((r) => r.key)).toContain('xx.bp.decision')
      expect(packInfo()).toMatchObject({ id: 'xx', version: '0.1.0' })
      expect(packCountingCitations().dayCounting).toBe('Vellmora Calendar Act 2')
      expect(packHolidayCalendar().holidayName('2027-03-03' as CivilDate)).toBe('Founding Day')
    })
    expect(loadPack().id).toBe('nh')
    expect(packHolidayCalendar().holidayName('2027-03-03' as CivilDate)).toBeNull()
  })

  it('validates the overriding pack with the manifest schema', () => {
    const broken = { ...XX_PACK, manifest: { ...XX_PACK.manifest, rules: [] } }
    withPackForTest(broken, () => {
      expect(() => loadPack()).toThrowError(expect.objectContaining({ id: ErrorIds.PACK_INVALID }))
    })
  })
})
