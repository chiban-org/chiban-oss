// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CaseWorkPlan } from '@/features/enforcement/workPlanTypes'
import { ALL_CAN, renderForm, stubDetail } from '@/test/enforcementRender'

vi.mock('./CaseAssignee', () => ({ CaseAssignee: () => null }))
vi.mock('./CaseParcel', () => ({ CaseParcel: () => null }))
vi.mock('./CaseVisibility', () => ({ CaseVisibility: () => null }))
vi.mock('../actions', () => ({ setCaseStatusAction: vi.fn() }))

const { CaseRail, CaseStrip } = await import('./CaseRail')

afterEach(cleanup)

const NOTE = 'Release the development hold before resolving or closing the case.'

const PLAN = {
  status: 'violation_found',
  stayed: false,
  sentence: '',
  now: null,
  due: null,
  remedies: [],
  groups: [],
  moves: ['no_violation'],
  heldNote: NOTE,
} as unknown as CaseWorkPlan

const BASE = stubDetail()

const PROPS = {
  detail: stubDetail({
    staff: {
      ...BASE.staff,
      row: { ...BASE.staff.row, openedOn: '2027-07-01', closedOn: null, closureReason: null },
    },
  }),
  can: ALL_CAN,
  assignee: { current: null, choices: [] },
  plan: PLAN,
}

describe('the hold note in the case rail and strip', () => {
  it('shows in the rail without opening More actions', () => {
    renderForm(<CaseRail {...PROPS} />)
    expect(screen.getAllByText(NOTE).map((n) => n.closest('details'))).toEqual([null])
  })

  it('shows in the phone strip without opening Facts and more actions', () => {
    renderForm(<CaseStrip {...PROPS} />)
    expect(screen.getAllByText(NOTE).map((n) => n.closest('details'))).toEqual([null])
  })
})
