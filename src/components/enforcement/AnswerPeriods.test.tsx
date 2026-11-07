// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AnswerPeriods } from '@/components/enforcement/AnswerPeriods'
import { computeSubjectDue } from '@/features/clocks/subjectDue'
import { PACK_COUNTING_CITATIONS, packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

afterEach(cleanup)

const d = (s: string) => s as CivilDate
const rule = (() => {
  const found = ruleByKey(loadPack(), 'nh.enf.answer_zoning')
  if (found.kind !== 'clock') throw new Error('rule')
  return found
})()
const dueFrom = (start: string) =>
  computeSubjectDue(rule, d(start), {
    holidays: packHolidayCalendar(),
    packVersion: loadPack().version,
    citations: PACK_COUNTING_CITATIONS,
  })

const dues = [
  { recipientId: 'o', name: 'Pat Owner', due: dueFrom('2027-03-01'), answeredOn: null },
  { recipientId: 't', name: 'Robin Renter', due: dueFrom('2027-03-03'), answeredOn: '2027-03-09' },
]

describe('the answer periods of an order', () => {
  it('states the counting rule and the consequence once, then one line per recipient', () => {
    const { container } = render(<AnswerPeriods dues={dues} today={d('2027-03-10')} />)
    const text = container.textContent
    expect(text.match(/RSA 21:35 II/g)?.length).toBe(1)
    expect(text.match(/If the date passes:/g)?.length).toBe(1)
    const rows = Array.from(container.querySelectorAll('li.record-item'))
    expect(rows.map((li) => li.textContent)).toEqual([
      'Pat Owner: served March 1, 2027. Due March 22, 2027, moved from March 21, 2027. 12 days left.',
      'Robin Renter: served March 3, 2027. Due March 23, 2027. Answer received March 9, 2027.',
    ])
  })

  it("words the shared counting rule without any one recipient's service date", () => {
    const { container } = render(<AnswerPeriods dues={dues} today={d('2027-03-10')} />)
    const shared = container.querySelector('ul')?.previousElementSibling?.previousElementSibling
    expect(shared?.textContent).toMatch(/^20 calendar days after the day the recipient is served\./)
    const header = Array.from(container.children[0]?.children ?? [])
      .filter((el) => el.tagName !== 'UL')
      .map((el) => el.textContent)
      .join(' ')
    expect(header).not.toMatch(/March \d/)
  })

  it('says no answer period is running before anyone is served', () => {
    const { container } = render(<AnswerPeriods dues={[]} today={d('2027-03-10')} />)
    expect(container.textContent).toBe(
      'No answer period is running. It starts when a recipient is served.',
    )
  })
})
