import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LeadStatus, type RailPlan } from './nextStepCard'

function plan(leadAllowed: boolean): RailPlan {
  return {
    lead: { to: 'closed', blockers: [] },
    leadAllowed,
    primary: null,
    secondary: [],
    terminal: ['closed'],
    board: null,
  }
}

describe('LeadStatus with nothing blocking', () => {
  it('names the move to closed as a sentence and points to More actions', () => {
    const html = renderToStaticMarkup(<LeadStatus plan={plan(true)} />)
    expect(html).toContain('Nothing blocks the move to closed. It is under More actions.')
    expect(html).not.toContain('Nothing blocks closed')
  })

  it('says the role cannot make the move when it is not allowed', () => {
    const html = renderToStaticMarkup(<LeadStatus plan={plan(false)} />)
    expect(html).toContain('Nothing blocks the move to closed. Your role cannot make this move.')
  })
})
