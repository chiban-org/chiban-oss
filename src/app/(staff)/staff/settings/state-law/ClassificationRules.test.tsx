// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ClassificationRules } from './ClassificationRules'

afterEach(cleanup)

const SUMMARIES = [
  {
    key: 'variance',
    label: 'Variance',
    mandatory: ['ZBA hearing deadline', 'ZBA decision deadline', 'ZBA mailed notice'],
  },
  { key: 'trade', label: 'Trade permit', mandatory: ['Suspended by appeal (RSA 676:6)'] },
  { key: 'local', label: 'Local zoning permit', mandatory: [] },
]

describe('ClassificationRules', () => {
  it('gives each classification its own row headed by its name and rule count', () => {
    render(<ClassificationRules summaries={SUMMARIES} />)
    const variance = screen.getByRole('listitem', { name: 'Variance' })
    expect(variance.querySelector('summary')?.textContent).toContain('3 required rules')
    const trade = screen.getByRole('listitem', { name: 'Trade permit' })
    expect(trade.querySelector('summary')?.textContent).toContain('1 required rule')
  })

  it('lists the rules one per line instead of joining them into a sentence', () => {
    render(<ClassificationRules summaries={SUMMARIES} />)
    const variance = screen.getByRole('listitem', { name: 'Variance' })
    const rules = within(variance)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(rules).toEqual(['ZBA hearing deadline', 'ZBA decision deadline', 'ZBA mailed notice'])
    expect(variance.textContent).not.toContain(';')
  })

  it('says a classification has no required rules instead of printing a bare label', () => {
    render(<ClassificationRules summaries={SUMMARIES} />)
    const local = screen.getByRole('listitem', { name: 'Local zoning permit' })
    expect(local.textContent).toContain('No required rules')
    expect(local.querySelector('details')).toBeNull()
    expect(local.textContent).not.toMatch(/:\s*$/)
  })
})
