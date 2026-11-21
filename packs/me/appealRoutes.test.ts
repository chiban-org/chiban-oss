import { describe, expect, it } from 'vitest'
import { mostSpecificRoute, type RouteFacts } from '@/features/appeals/routeWindow'
import type { AppealNodeKind } from '@/features/packs/schema'
import { ME_PACK } from './index'

const NO_FACTS: RouteFacts = {
  outcome: null,
  linkedComponent: false,
  finalReviewBoard: null,
  significant: null,
}

function windowFor(from: AppealNodeKind, to: AppealNodeKind, facts: Partial<RouteFacts> = {}) {
  const routes = ME_PACK.appealRoutes.filter((r) => r.from === from && r.to === to)
  const hit = mostSpecificRoute(routes, { ...NO_FACTS, ...facts })
  if (hit === undefined) throw new Error(`no route ${from} to ${to}`)
  return hit.windowRuleKey
}

describe('Maine appeal routes', () => {
  it('sends an administrative decision to the board and the board to a decision', () => {
    expect(windowFor('administrative_decision', 'zba_appeal')).toBe('me.appeal.admin_to_boa')
    expect(windowFor('zba_appeal', 'zba_decision')).toBeNull()
    expect(windowFor('rehearing_motion', 'rehearing_outcome')).toBeNull()
  })

  it('gives a board of appeals decision 45 days unless the planning board approves last', () => {
    expect(windowFor('zba_decision', 'court_petition', { outcome: 'denied' })).toBe(
      'me.appeal.boa_court',
    )
    expect(windowFor('zba_decision', 'court_petition', { outcome: 'granted' })).toBe(
      'me.appeal.boa_court',
    )
    expect(
      windowFor('zba_decision', 'court_petition', {
        outcome: 'granted',
        finalReviewBoard: 'zba',
      }),
    ).toBe('me.appeal.boa_court')
    expect(
      windowFor('zba_decision', 'court_petition', {
        outcome: 'granted',
        finalReviewBoard: 'planning_board',
      }),
    ).toBe('me.appeal.board_court_final')
    expect(
      windowFor('zba_decision', 'court_petition', {
        outcome: 'denied',
        finalReviewBoard: 'planning_board',
      }),
    ).toBe('me.appeal.boa_court')
    expect(windowFor('zba_decision', 'rehearing_motion')).toBe('me.appeal.boa_reconsideration')
  })

  it('gives a reconsidered decision 15 days whatever the outcome and final review board', () => {
    for (const outcome of ['granted', 'denied'] as const) {
      for (const finalReviewBoard of [null, 'zba', 'planning_board'] as const) {
        expect(
          windowFor('rehearing_outcome', 'court_petition', { outcome, finalReviewBoard }),
        ).toBe('me.appeal.boa_court_after_reconsideration')
      }
    }
    expect(
      ME_PACK.appealRoutes.filter(
        (r) => r.from === 'rehearing_outcome' && r.to === 'court_petition',
      ),
    ).toHaveLength(1)
  })

  it('never returns a reconsideration to the board decision', () => {
    expect(
      ME_PACK.appealRoutes.filter((r) => r.from === 'rehearing_outcome' && r.to === 'zba_decision'),
    ).toEqual([])
  })

  it('splits a Planning Board decision by outcome and significance', () => {
    const cases = [
      [{ outcome: 'denied' }, 'me.appeal.board_court_denial'],
      [{ outcome: 'denied', significant: false }, 'me.appeal.board_court_denial'],
      [{ outcome: 'granted' }, 'me.appeal.board_court_final'],
      [{ outcome: 'granted', significant: false }, 'me.appeal.board_court_final'],
      [{ outcome: 'denied', significant: true }, 'me.appeal.significant_denial'],
      [{ outcome: 'granted', significant: true }, 'me.appeal.significant_final'],
    ] as const
    for (const [facts, key] of cases) {
      expect(windowFor('pb_decision', 'court_petition', facts)).toBe(key)
    }
  })

  it('names a window rule and a Maine citation on every route', () => {
    const keys = new Set(ME_PACK.manifest.rules.map((r) => r.key))
    for (const route of ME_PACK.appealRoutes) {
      if (route.windowRuleKey !== null) expect(keys.has(route.windowRuleKey)).toBe(true)
      expect(new URL(route.citation.url).host).toBe('legislature.maine.gov')
    }
  })
})
