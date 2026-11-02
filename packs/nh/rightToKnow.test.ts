import { NH_RTK_EXEMPTIONS, OTHER_LAW_EXEMPTION_KEY } from '@packs/nh/rtkExemptions'
import { describe, expect, it } from 'vitest'
import { computeSubjectDue } from '@/features/clocks/subjectDue'
import { PACK_COUNTING_CITATIONS, packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate

describe('right-to-know rules', () => {
  it('response rule counts 5 business days', () => {
    const rule = ruleByKey(loadPack(), 'nh.rtk.response')
    if (rule.kind !== 'clock') throw new Error('not a clock')
    const due = computeSubjectDue(rule, d('2027-07-02'), {
      holidays: packHolidayCalendar(),
      packVersion: loadPack().version,
      citations: PACK_COUNTING_CITATIONS,
    })
    expect(due.due).toBe('2027-07-12')
    expect(due.countingMethod).toContain('5 business days after 2027-07-02')
    expect(rule.citation.label).toBe('RSA 91-A:4 IV(b)')
    expect(rule.extension.allowed).toBe(false)
  })

  it('denial statement requires an exemption and an explanation', () => {
    const rule = ruleByKey(loadPack(), 'nh.rtk.denial_statement')
    if (rule.kind !== 'required_record') throw new Error('not a record rule')
    expect(rule.fields).toEqual(['exemption', 'explanation'])
    expect(rule.citation.label).toBe('RSA 91-A:4 IV(c)')
  })

  it('exemption catalog has fourteen paragraphs from I to XIII including I-a', () => {
    expect(NH_RTK_EXEMPTIONS.map((e) => e.paragraph)).toEqual([
      'I',
      'I-a',
      'II',
      'III',
      'IV',
      'V',
      'VI',
      'VII',
      'VIII',
      'IX',
      'X',
      'XI',
      'XII',
      'XIII',
    ])
  })

  it('no exemption key repeats and every one cites RSA 91-A:5', () => {
    const keys = NH_RTK_EXEMPTIONS.map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const e of NH_RTK_EXEMPTIONS) {
      expect(e.key).toBe(`nh.rtk.91a5.${e.paragraph.toLowerCase()}`)
      expect(e.citation.label).toBe(`RSA 91-A:5 ${e.paragraph}`)
      expect(e.citation.url).toBe('https://gc.nh.gov/rsa/html/VI/91-A/91-A-5.htm')
      expect(e.label.length).toBeGreaterThan(10)
    }
    expect(OTHER_LAW_EXEMPTION_KEY).toBe('other_law')
  })

  it('X(a) is not an exemption', () => {
    expect(NH_RTK_EXEMPTIONS.some((e) => /^X\([a-c]\)$/.test(e.paragraph))).toBe(false)
    expect(
      NH_RTK_EXEMPTIONS.filter((e) => e.paragraph.startsWith('X')).map((e) => e.paragraph),
    ).toEqual(['X', 'XI', 'XII', 'XIII'])
  })
})
