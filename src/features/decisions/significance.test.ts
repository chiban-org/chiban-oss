import { ME_PACK } from '@packs/me'
import { afterEach, describe, expect, it } from 'vitest'
import {
  significanceMissing,
  significanceQuestion,
  storedSignificance,
} from '@/features/decisions/significance'
import { loadPack } from '@/features/packs/loadPack'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ProceedingClassification } from '@/features/packs/schema'

afterEach(() => setActivePackForTest(null))

function classification(key: string): ProceedingClassification {
  const found = loadPack().classifications.find((c) => c.key === key)
  if (found === undefined) throw new Error(`no classification ${key}`)
  return found
}

describe('the significance question', () => {
  it('asks the Maine question with its help on a classification it applies to', () => {
    setActivePackForTest(ME_PACK)
    expect(significanceQuestion(classification('me.pb_site_plan'))).toEqual({
      question:
        'Is this a significant land use decision (large buildings, more than 3 acres, or 10 or more lots)?',
      help: ME_PACK.labels.significantDecisionHelp,
    })
  })

  it('asks nothing and requires nothing when the pack states no question', () => {
    const applies = { ...classification('nh.pb_subdivision'), significanceApplies: true }
    expect(significanceQuestion(applies)).toBeNull()
    expect(significanceMissing(applies, 'approved', undefined)).toBe(false)
    expect(storedSignificance(applies, 'approved', true)).toBeNull()
  })
})
