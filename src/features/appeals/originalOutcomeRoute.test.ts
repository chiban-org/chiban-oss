import { NH_APPEAL_ROUTES } from '@packs/nh/appealRoutes'
import { describe, expect, it } from 'vitest'
import {
  mostSpecificRoute,
  type RouteFacts,
  usesOriginalOutcome,
} from '@/features/appeals/routeWindow'
import type { AppealRoute } from '@/features/packs/schema'

const CITATION = { label: 'Vellmora Permit Act 24', url: 'https://laws.example/vellmora' }

function route(key: string, when?: AppealRoute['when']): AppealRoute {
  return {
    from: 'rehearing_outcome',
    ...(when === undefined ? {} : { when }),
    to: 'court_petition',
    windowRuleKey: key,
    citation: CITATION,
  }
}

const REFUSED: RouteFacts = {
  outcome: 'denied',
  linkedComponent: false,
  finalReviewBoard: 'planning_board',
  significant: null,
}

const REFUSAL = route('refusal', { outcome: 'denied', label: 'refused' })
const ORIGINAL_GRANT = route('original_grant', {
  outcome: 'denied',
  finalReviewBoard: 'planning_board',
  originalOutcome: 'granted',
  label: 'refused, original approval',
})

function chosen(routes: AppealRoute[], facts: RouteFacts) {
  return mostSpecificRoute(routes, facts)?.windowRuleKey ?? null
}

describe('a route conditioned on the original decision outcome', () => {
  it('applies only when the original decision matches, and outranks a looser route', () => {
    const routes = [REFUSAL, ORIGINAL_GRANT]
    expect(chosen(routes, { ...REFUSED, originalOutcome: 'granted' })).toBe('original_grant')
    expect(chosen(routes, { ...REFUSED, originalOutcome: 'denied' })).toBe('refusal')
    expect(chosen(routes, { ...REFUSED, originalOutcome: null })).toBe('refusal')
    expect(chosen(routes, REFUSED)).toBe('refusal')
  })

  it('changes the chosen route when the condition changes', () => {
    const flipped = route('original_grant', {
      ...(ORIGINAL_GRANT.when as NonNullable<AppealRoute['when']>),
      originalOutcome: 'denied',
    })
    const facts = { ...REFUSED, originalOutcome: 'granted' as const }
    expect(chosen([REFUSAL, ORIGINAL_GRANT], facts)).not.toBe(chosen([REFUSAL, flipped], facts))
  })

  it('is only looked up for routes that use it, and NH uses none', () => {
    expect(usesOriginalOutcome([REFUSAL])).toBe(false)
    expect(usesOriginalOutcome([REFUSAL, ORIGINAL_GRANT])).toBe(true)
    expect(usesOriginalOutcome(NH_APPEAL_ROUTES)).toBe(false)
  })
})
