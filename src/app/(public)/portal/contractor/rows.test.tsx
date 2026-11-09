import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ContractorProjectRow } from '@/features/contractors/dashboard'
import type { NeedItem } from '@/features/contractors/dashboardNeeds'
import type { CivilDate } from '@/types/civilDate'
import { NeedsYou } from './NeedsYou'
import { ProjectRow } from './ProjectRow'

const needs: NeedItem[] = Array.from({ length: 9 }, (_, i) => ({
  key: `n${i}`,
  kind: 'pay',
  text: `Need number ${i}`,
  href: `/portal/applications/a${i}`,
  linkLabel: 'Pay',
}))

const row: ContractorProjectRow = {
  projectId: 'p1',
  title: 'Garage',
  parcelDisplayId: '12-3',
  siteAddress: { state: 'known', value: '1 Mill Road' } as ContractorProjectRow['siteAddress'],
  applications: [
    {
      applicationId: 'a1',
      number: 'EL-1',
      typeLabel: 'Electrical permit',
      state: 'issued',
      issuedOn: null,
      dueCents: 0,
      missingDocuments: [],
      upcoming: [],
      resultsOwed: [{ date: '2027-03-08' as CivilDate, startMinute: 540, typeLabel: 'Final' }],
    },
  ],
}

describe('NeedsYou', () => {
  it('makes every need reachable when there are more than six', () => {
    const html = renderToStaticMarkup(<NeedsYou needs={needs} />)
    for (let i = 0; i < 9; i += 1) expect(html).toContain(`Need number ${i}`)
    expect(html).toContain('Show all 9')
    expect(html).not.toContain('marked on the projects below')
  })
})

describe('ProjectRow', () => {
  it('shows an inspection result still owed', () => {
    const html = renderToStaticMarkup(<ProjectRow row={row} />)
    expect(html).toContain('No result recorded for the final inspection of March 8, 2027')
  })
})
