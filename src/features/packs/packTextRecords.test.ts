import { ME_PACK } from '@packs/me'
import { NH_PACK } from '@packs/nh'
import { describe, expect, it } from 'vitest'
import { packText } from '@/features/packs/packText'
import { withPackForTest } from '@/features/packs/registry'

describe('the records acknowledgement in pack text', () => {
  it('is on for Maine and off for New Hampshire', () => {
    expect(withPackForTest(ME_PACK, () => packText().recordsAcknowledgement)).toBe(true)
    expect(withPackForTest(NH_PACK, () => packText().recordsAcknowledgement)).toBe(false)
  })
})
