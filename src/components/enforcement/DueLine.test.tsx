// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DueLine } from '@/components/enforcement/DueLine'
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
const due = computeSubjectDue(rule, d('2027-03-01'), {
  holidays: packHolidayCalendar(),
  packVersion: loadPack().version,
  citations: PACK_COUNTING_CITATIONS,
})

describe('DueLine', () => {
  it('DueLine shows rolled from 2027-03-21', () => {
    const { container } = render(<DueLine due={due} today={d('2027-03-10')} />)
    const text = container.textContent
    expect(text).toContain('Due March 22, 2027, moved from March 21, 2027.')
    expect(text).toContain('12 days left.')
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('shows the rule label, citation, start event, counting method, and consequence', () => {
    const { container } = render(<DueLine due={due} today={d('2027-03-10')} />)
    const text = container.textContent
    expect(text).toContain('Answer to a cease and desist order')
    expect(screen.getByRole('link', { name: 'RSA 676:17-a V' }).getAttribute('href')).toContain(
      'gc.nh.gov',
    )
    expect(text).toContain('Starts: Order served, March 1, 2027.')
    expect(text).toContain('RSA 21:35 II')
    expect(text).toContain(
      'the enforcement official may move the district court to enforce the order',
    )
  })

  it('says due today and passed in words', () => {
    const today = render(<DueLine due={due} today={d('2027-03-22')} />)
    expect(today.container.textContent).toContain('Due today.')
    cleanup()
    const passed = render(<DueLine due={due} today={d('2027-03-25')} />)
    expect(passed.container.textContent).toContain('Passed 3 days ago.')
  })
})
