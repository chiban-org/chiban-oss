import { describe, expect, it } from 'vitest'
import { NOTICE_CHANNELS } from '@/features/notices/channels'
import {
  ALLOWED_METHODS,
  methodAllowed,
  PROOF_METHOD_LABELS,
  PROOF_METHODS,
  referenceRequired,
} from '@/features/notices/proofMethods'

describe('proof methods', () => {
  it('certificate of mailing proves verified mail', () => {
    expect(methodAllowed('verified_mail', 'certificate_of_mailing')).toBe(true)
  })

  it('certified channel refuses a certificate of mailing', () => {
    expect(methodAllowed('certified_mail', 'certificate_of_mailing')).toBe(false)
    expect(methodAllowed('certified_mail', 'certified_mail')).toBe(true)
  })

  it('verified mail takes certified mail and another carrier with evidence', () => {
    expect(ALLOWED_METHODS.verified_mail).toEqual([
      'certified_mail',
      'certificate_of_mailing',
      'other_carrier_with_evidence',
    ])
  })

  it('first class takes first class, certificate of mailing, or certified', () => {
    expect(ALLOWED_METHODS.first_class_mail).toEqual([
      'first_class_mail',
      'certificate_of_mailing',
      'certified_mail',
    ])
  })

  it('newspaper, postings and website each take their own method', () => {
    expect(ALLOWED_METHODS.newspaper).toEqual(['newspaper_publication'])
    expect(ALLOWED_METHODS.public_posting).toEqual(['posting'])
    expect(ALLOWED_METHODS.bulletin_board).toEqual(['posting'])
    expect(ALLOWED_METHODS.website).toEqual(['website_posting'])
  })

  it('a reference is required only for certified mail and other carriers', () => {
    const required = PROOF_METHODS.filter(referenceRequired)
    expect(required).toEqual(['certified_mail', 'other_carrier_with_evidence'])
  })

  it('every channel has at least one method and every method a label', () => {
    for (const channel of NOTICE_CHANNELS)
      expect(ALLOWED_METHODS[channel].length).toBeGreaterThan(0)
    for (const method of PROOF_METHODS) expect(PROOF_METHOD_LABELS[method]).not.toContain('_')
  })
})
