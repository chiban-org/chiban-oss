import { NH_STATE_CODE_SECTIONS, stateCodeReference } from '@packs/nh/buildingCodeSections'
import { NH_CODE_EDITIONS } from '@packs/nh/codeEditions'
import { describe, expect, it } from 'vitest'

describe('the NH state building code starter list', () => {
  it('keeps between 8 and 15 entries', () => {
    expect(NH_STATE_CODE_SECTIONS.length).toBeGreaterThanOrEqual(8)
    expect(NH_STATE_CODE_SECTIONS.length).toBeLessThanOrEqual(15)
  })

  it('cites an ICC code text page for every entry', () => {
    for (const entry of NH_STATE_CODE_SECTIONS) {
      expect(entry.sourceUrl).toMatch(/^https:\/\/codes\.iccsafe\.org\/content\/I[RB]C\d{4}/)
      expect(entry.sourceUrl).toContain(`${entry.code}${entry.edition}`)
    }
  })

  it('ties every entry to a verified edition whose components include its code and year', () => {
    for (const entry of NH_STATE_CODE_SECTIONS) {
      const edition = NH_CODE_EDITIONS.find((e) => e.key === entry.editionKey)
      expect(edition?.status).toBe('verified')
      expect(edition?.components).toContainEqual({ code: entry.code, edition: entry.edition })
    }
  })

  it('puts the code and edition in each reference', () => {
    const first = NH_STATE_CODE_SECTIONS[0]
    expect(first === undefined ? '' : stateCodeReference(first)).toBe('IRC 2021 Section R105.1')
  })

  it('lists each section once', () => {
    const refs = NH_STATE_CODE_SECTIONS.map(stateCodeReference)
    expect(new Set(refs).size).toBe(refs.length)
  })
})
