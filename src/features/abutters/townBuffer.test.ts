import { NH_ABUTTER_PARAMS } from '@packs/nh/abutters/params'
import { describe, expect, it } from 'vitest'
import { bufferWithinMax, effectiveBufferFt } from '@/features/abutters/townBuffer'
import type { AbutterParams } from '@/features/packs/schema'

const WITH_BUFFER: AbutterParams = {
  ...NH_ABUTTER_PARAMS,
  townBuffer: { defaultFt: 300, maxFt: 500 },
}
const WITHOUT_DEFAULT: AbutterParams = {
  ...NH_ABUTTER_PARAMS,
  townBuffer: { defaultFt: null, maxFt: 500 },
}

describe('effectiveBufferFt', () => {
  it('is null when the pack has no town buffer, whatever the town set', () => {
    expect(effectiveBufferFt(250, NH_ABUTTER_PARAMS)).toBeNull()
    expect(effectiveBufferFt(undefined, NH_ABUTTER_PARAMS)).toBeNull()
  })

  it('uses the town value, then the pack default, then null', () => {
    expect(effectiveBufferFt(250, WITH_BUFFER)).toBe(250)
    expect(effectiveBufferFt(null, WITH_BUFFER)).toBe(300)
    expect(effectiveBufferFt(undefined, WITH_BUFFER)).toBe(300)
    expect(effectiveBufferFt(null, WITHOUT_DEFAULT)).toBeNull()
  })
})

describe('bufferWithinMax', () => {
  it('accepts values up to the maximum and refuses above it', () => {
    expect(bufferWithinMax(500, WITH_BUFFER)).toBe(true)
    expect(bufferWithinMax(501, WITH_BUFFER)).toBe(false)
  })

  it('refuses any value when the pack has no town buffer', () => {
    expect(bufferWithinMax(1, NH_ABUTTER_PARAMS)).toBe(false)
  })
})
