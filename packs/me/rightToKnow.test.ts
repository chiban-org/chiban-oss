import { describe, expect, it } from 'vitest'
import { computeSubjectDue } from '@/features/clocks/subjectDue'
import { packCountingCitations, packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { withPackForTest } from '@/features/packs/registry'
import { OTHER_LAW_EXEMPTION_KEY } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'
import { ME_PACK } from './index'
import { ME_FOAA_EXEMPTIONS } from './rtkExemptions'

const d = (s: string) => s as CivilDate
const SECTION_408A = 'https://legislature.maine.gov/statutes/1/title1sec408-A.html'

describe('Freedom of Access Act rules', () => {
  it('acknowledges a request within 5 working days', () => {
    withPackForTest(ME_PACK, () => {
      const rule = ruleByKey(loadPack(), 'me.foaa.acknowledge')
      if (rule.kind !== 'clock') throw new Error('not a clock')
      const due = computeSubjectDue(rule, d('2027-01-08'), {
        holidays: packHolidayCalendar(),
        packVersion: loadPack().version,
        citations: packCountingCitations(),
      })
      expect(due.due).toBe('2027-01-15')
      expect(due.countingMethod).toContain('5 business days after 2027-01-08')
      expect(rule.citation).toEqual({ label: '1 MRSA §408-A(3)', url: SECTION_408A })
      expect(ME_PACK.recordsRequests.acknowledgement).toBe(true)
    })
  })

  it('counts a Monday holiday out of the acknowledgement window', () => {
    withPackForTest(ME_PACK, () => {
      const rule = ruleByKey(loadPack(), 'me.foaa.acknowledge')
      if (rule.kind !== 'clock') throw new Error('not a clock')
      const due = computeSubjectDue(rule, d('2027-01-15'), {
        holidays: packHolidayCalendar(),
        packVersion: loadPack().version,
        citations: packCountingCitations(),
      })
      expect(due.due).toBe('2027-01-25')
    })
  })

  it('holds the town to the estimate it stated', () => {
    withPackForTest(ME_PACK, () => {
      const rule = ruleByKey(loadPack(), 'me.foaa.estimate')
      if (rule.kind !== 'clock') throw new Error('not a clock')
      expect(rule.startEvent).toBe('rtk_time_statement')
      expect(rule.length).toEqual({ unit: 'stated_date' })
      expect(rule.citation.label).toBe('1 MRSA §408-A(3)')
    })
  })

  it('a denial notice records the exemption and its explanation', () => {
    withPackForTest(ME_PACK, () => {
      const rule = ruleByKey(loadPack(), 'me.foaa.denial_notice')
      if (rule.kind !== 'required_record') throw new Error('not a record rule')
      expect(rule.fields).toEqual(['exemption', 'explanation'])
      expect(rule.citation).toEqual({ label: '1 MRSA §408-A(4)', url: SECTION_408A })
    })
  })

  it('lists 24 exemptions from A to X with C-1 and without the repealed R', () => {
    expect(ME_FOAA_EXEMPTIONS).toHaveLength(24)
    const paragraphs = ME_FOAA_EXEMPTIONS.map((e) => e.paragraph)
    expect(paragraphs.slice(0, 5)).toEqual(['A', 'B', 'C', 'C-1', 'D'])
    expect(paragraphs).not.toContain('R')
    expect(paragraphs.at(-1)).toBe('X')
  })

  it('no exemption key repeats and every one cites 1 MRSA §402(3)', () => {
    const keys = ME_FOAA_EXEMPTIONS.map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).not.toContain(OTHER_LAW_EXEMPTION_KEY)
    for (const e of ME_FOAA_EXEMPTIONS) {
      expect(e.key).toBe(`me.foaa.402_3.${e.paragraph.toLowerCase()}`)
      expect(e.citation).toEqual({
        label: `1 MRSA §402(3)(${e.paragraph})`,
        url: 'https://legislature.maine.gov/statutes/1/title1sec402.html',
      })
      expect(e.label.length).toBeGreaterThan(5)
    }
  })

  it('names the pack exemptions in plain words', () => {
    const label = (p: string) => ME_FOAA_EXEMPTIONS.find((e) => e.paragraph === p)?.label
    expect(label('A')).toBe('Records designated confidential by statute')
    expect(label('N')).toBe('Social Security numbers')
    expect(ME_PACK.rtkExemptions).toBe(ME_FOAA_EXEMPTIONS)
  })
})
