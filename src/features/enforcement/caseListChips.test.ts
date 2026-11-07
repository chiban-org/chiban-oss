import { describe, expect, it } from 'vitest'
import { readTableParams } from '@/features/dataTable/params'
import type { CaseListFacets } from '@/features/enforcement/caseList'
import { caseStageTabs } from '@/features/enforcement/caseListChips'
import { readCasesView } from '@/features/enforcement/caseListParams'

const facets: CaseListFacets = {
  statuses: new Map([
    ['intake', 2],
    ['order_issued', 3],
    ['in_court', 1],
    ['closed', 4],
  ]),
  due: new Map(),
  assigned: new Map(),
}

describe('enforcement status tabs', () => {
  it('opens on Open with the count of every unfinished case and counts each tab', () => {
    const tabs = caseStageTabs(readTableParams({}), facets)
    expect(tabs.map((t) => [t.label, t.count, t.active])).toEqual([
      ['Open', 6, true],
      ['Order issued', 3, false],
      ['In court', 1, false],
      ['Closed', 4, false],
      ['All', 10, false],
    ])
  })

  it('reads the chosen tab as the statuses it covers and All as no status filter', () => {
    expect(readCasesView({ stage: 'court' }).filters.statuses).toEqual(['in_court'])
    expect(readCasesView({ stage: 'all' }).filters.statuses).toBeUndefined()
    expect(readCasesView({}).filters.statuses).toContain('intake')
  })
})
