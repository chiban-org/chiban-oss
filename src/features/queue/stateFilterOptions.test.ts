import { describe, expect, it } from 'vitest'
import { stateFilterOptions } from '@/features/queue/stateFilterOptions'

describe('stateFilterOptions', () => {
  it('offers every state with its sentence-case label', () => {
    const options = stateFilterOptions()
    expect(options).toContainEqual(['under_review', 'Under review'])
    expect(options).toContainEqual(['draft', 'Draft'])
    expect(options.map(([, label]) => label)).not.toContain('under review')
  })

  it('leads with needs action as the default and all but draft as the wide view', () => {
    expect(stateFilterOptions().slice(0, 2)).toEqual([
      ['', 'Needs action'],
      ['all', 'All but draft'],
    ])
  })
})
