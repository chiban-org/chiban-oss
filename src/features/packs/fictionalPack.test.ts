import { afterEach, describe, expect, it } from 'vitest'
import { isApplicationClassification } from '@/features/applications/applicationTypeSchema'
import { gateAnchor } from '@/features/applications/nextStep'
import { stateLabel } from '@/features/applications/stateLabel'
import { regionalGateDefinitions } from '@/features/boards/regionalGate'
import { codeEditionApplies } from '@/features/building/codeEditionApplies'
import { buildingGateDefinitions } from '@/features/building/gates'
import { ruleChoicesFor } from '@/features/config/ruleChoices'
import { defaultParcelFileVisibility } from '@/features/documents/parcelVisibility'
import { loadPack } from '@/features/packs/loadPack'
import { packInfo } from '@/features/packs/packInfo'
import { setActivePackForTest, withPackForTest } from '@/features/packs/registry'
import { packRoles } from '@/features/packs/roles'
import { XX_PACK } from '@/test/packs/xx'

afterEach(() => setActivePackForTest(null))

describe('a fictional pack with every optional role absent', () => {
  it('loads, validates and reports itself through the registry', () => {
    withPackForTest(XX_PACK, () => {
      expect(loadPack().id).toBe('xx')
      expect(packInfo()).toMatchObject({ id: 'xx', version: '0.1.0' })
      expect(packRoles().rules.regionalImpactGate).toBeNull()
    })
  })

  it('registers no regional impact or code edition gate', () => {
    withPackForTest(XX_PACK, () => {
      expect(buildingGateDefinitions()).toEqual([])
      expect(regionalGateDefinitions()).toEqual([])
    })
    const nhKeys = buildingGateDefinitions().map((g) => g.key)
    expect(nhKeys).toEqual(['nh.bp.code_edition_recorded', 'nh.bp.regional_impact'])
    expect(regionalGateDefinitions().map((g) => g.key)).toEqual(['nh.ri.determination'])
  })

  it('offers no code edition record for its building permits', () => {
    withPackForTest(XX_PACK, () => expect(codeEditionApplies('xx.building_permit')).toBe(false))
    expect(codeEditionApplies('nh.building_permit')).toBe(true)
  })

  it('sends no gate to the regional impact panel', () => {
    withPackForTest(XX_PACK, () => {
      expect(gateAnchor('nh.bp.regional_impact')).toBe('requirements')
    })
    expect(gateAnchor('nh.bp.regional_impact')).toBe('regional-impact')
  })

  it('labels a suspended application without an appeal suspension rule', () => {
    withPackForTest(XX_PACK, () => expect(stateLabel('suspended')).toBe('Suspended'))
    expect(stateLabel('suspended')).toBe('Suspended by appeal (RSA 676:6)')
  })

  it('reads its own classifications, record series and rule groups', () => {
    withPackForTest(XX_PACK, () => {
      expect(isApplicationClassification('xx.building_permit')).toBe(true)
      expect(isApplicationClassification('nh.building_permit')).toBe(false)
      expect(defaultParcelFileVisibility('xx.rs.permits')).toBe('public')
      const rules = [
        { key: 'xx.bp.decision', label: 'Decision' },
        { key: 'xx.rtk.response', label: 'Response' },
      ]
      expect(
        ruleChoicesFor(rules, { boardKind: 'planning_board' }, packRoles().ruleGroups).map(
          (r) => r.key,
        ),
      ).toEqual(['xx.rtk.response'])
    })
  })
})
