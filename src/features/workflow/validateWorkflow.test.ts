import { describe, expect, it } from 'vitest'
import { classificationOf } from '@/features/packs/probes/probe'
import { validateWorkflow } from '@/features/workflow/validateWorkflow'

const SPR = classificationOf('nh.pb_site_plan')
const VAR = classificationOf('nh.zba_variance')
const PERMIT = classificationOf('nh.building_permit')

const base = (substeps: { state: never; key: string; label: string }[], direct = false) => ({
  allowsDirectIssue: direct,
  substeps,
  closesOn: 'staff_closes' as const,
})
const step = (state: string, key: string) => ({ state: state as never, key, label: key })

describe('validateWorkflow', () => {
  it('removing the hearing substep from VAR is missing_required_substep', () => {
    expect(validateWorkflow(base([]), VAR)).toEqual([
      { code: 'missing_required_substep', state: 'under_review', key: 'hearing' },
    ])
  })

  it('a variance with the hearing substep has no issues', () => {
    expect(validateWorkflow(base([step('under_review', 'hearing')]), VAR)).toEqual([])
  })

  it('SPR needs both filed and hearing', () => {
    expect(validateWorkflow(base([step('under_review', 'hearing')]), SPR)).toEqual([
      { code: 'missing_required_substep', state: 'submitted', key: 'filed' },
    ])
  })

  it('enabling direct issue on SPR is direct_issue_not_allowed', () => {
    const workflow = base([step('submitted', 'filed'), step('under_review', 'hearing')], true)
    expect(validateWorkflow(workflow, SPR)).toEqual([{ code: 'direct_issue_not_allowed' }])
  })

  it('direct issue stays allowed for a building permit', () => {
    expect(validateWorkflow(base([], true), PERMIT)).toEqual([])
  })

  it('a substep on closed is terminal_state_substep', () => {
    expect(validateWorkflow(base([step('closed', 'archive')]), PERMIT)).toEqual([
      { code: 'terminal_state_substep', state: 'closed', key: 'archive' },
    ])
  })

  it('a repeated key within a state is duplicate_substep', () => {
    const workflow = base([step('submitted', 'intake'), step('submitted', 'intake')])
    expect(validateWorkflow(workflow, PERMIT)).toEqual([
      { code: 'duplicate_substep', state: 'submitted', key: 'intake' },
    ])
  })

  it('an unknown state is unknown_state', () => {
    expect(validateWorkflow(base([step('limbo', 'x')]), PERMIT)).toEqual([
      { code: 'unknown_state', state: 'limbo', key: 'x' },
    ])
  })
})
