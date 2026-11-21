import { describe, expect, it } from 'vitest'
import { mostSpecificRoute } from '@/features/appeals/routeWindow'
import type { AppealRoute } from '@/features/packs/schema'

const CITATION = { label: 'Vellmora Permit Act 23', url: 'https://laws.example/vellmora' }

function route(key: string, when?: AppealRoute['when']): AppealRoute {
  return {
    from: 'pb_decision',
    ...(when === undefined ? {} : { when }),
    to: 'court_petition',
    windowRuleKey: key,
    citation: CITATION,
  }
}

const ROUTES = [
  route('denial', { outcome: 'denied', label: 'denied' }),
  route('final', { outcome: 'granted', label: 'approved' }),
  route('significant_denial', { outcome: 'denied', significant: true, label: 'significant' }),
  route('significant_final', { outcome: 'granted', significant: true, label: 'significant' }),
]

function chosen(outcome: 'granted' | 'denied', significant: boolean | null): string | null {
  const hit = mostSpecificRoute(ROUTES, {
    outcome,
    linkedComponent: false,
    finalReviewBoard: null,
    significant,
  })
  return hit?.windowRuleKey ?? null
}

describe('routes that match on a significant land use decision', () => {
  it('prefers the significant route over the outcome route it narrows', () => {
    expect(chosen('denied', true)).toBe('significant_denial')
    expect(chosen('granted', true)).toBe('significant_final')
  })

  it('keeps the outcome route for a decision that is not significant or has no flag', () => {
    expect(chosen('denied', false)).toBe('denial')
    expect(chosen('granted', null)).toBe('final')
  })

  it('matches a route that asks for a decision that is not significant only on false', () => {
    const notSignificant = [
      route('plain'),
      route('ordinary', { significant: false, label: 'ordinary' }),
    ]
    const facts = { outcome: 'granted' as const, linkedComponent: false, finalReviewBoard: null }
    expect(mostSpecificRoute(notSignificant, { ...facts, significant: false })?.windowRuleKey).toBe(
      'ordinary',
    )
    expect(mostSpecificRoute(notSignificant, { ...facts, significant: null })?.windowRuleKey).toBe(
      'plain',
    )
  })
})
