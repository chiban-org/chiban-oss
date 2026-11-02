// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RecordsSection } from '@/components/parcels/RecordsSection'
import type { ParcelHistory } from '@/features/parcels/parcelHistory'

afterEach(cleanup)

const record = {
  kind: 'permit',
  recordId: 'r1',
  title: 'Deck permit',
  number: 'BP-2027-001',
  status: { label: 'Issued', chip: 'passed' as const },
  date: null,
  href: '/records/r1',
}

describe('RecordsSection', () => {
  it('shows the empty-state sentence when no source is registered', () => {
    const history: ParcelHistory = { own: [], ancestral: [], sourcesRegistered: 0 }
    render(<RecordsSection history={history} />)
    expect(screen.getByText('No records for this parcel are in Chiban yet.')).toBeTruthy()
  })

  it('shows the empty-state sentence when a source is registered but nothing matches', () => {
    render(<RecordsSection history={{ own: [], ancestral: [], sourcesRegistered: 2 }} />)
    expect(screen.getByText('No records for this parcel are in Chiban yet.')).toBeTruthy()
  })

  it('shows own records, then the ancestral label with its records', () => {
    const history: ParcelHistory = {
      own: [record],
      ancestral: [
        {
          parcelId: 'p',
          displayId: '007020000000',
          label: 'from parent lot 007020000000, before the 2027 subdivision',
          records: [{ ...record, recordId: 'r2', title: 'Old shed permit' }],
        },
      ],
      sourcesRegistered: 1,
    }
    render(<RecordsSection history={history} />)
    expect(screen.getByText('Deck permit')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(
      'from parent lot 007020000000, before the 2027 subdivision',
    )
    expect(screen.getByText('Old shed permit')).toBeTruthy()
    expect(screen.getAllByText('Issued')).toHaveLength(2)
  })

  it('labels a carried-forward record with its source parcel', () => {
    const history: ParcelHistory = {
      own: [{ ...record, carriedFrom: { parcelId: 'p', displayId: '007020000000' } }],
      ancestral: [],
      sourcesRegistered: 1,
    }
    render(<RecordsSection history={history} />)
    expect(screen.getByText(/Carried forward from parcel/).textContent).toBe(
      'Carried forward from parcel 007020000000',
    )
  })

  it('renders a record with no page as plain text, not a link', () => {
    const history: ParcelHistory = {
      own: [{ ...record, href: null }],
      ancestral: [],
      sourcesRegistered: 1,
    }
    render(<RecordsSection history={history} />)
    expect(screen.getByText('Deck permit').closest('a')).toBeNull()
  })

  it('links the parent lot in an ancestral heading and the source of a carried-forward record', () => {
    const history: ParcelHistory = {
      own: [{ ...record, carriedFrom: { parcelId: 'src', displayId: '007030000000' } }],
      ancestral: [
        {
          parcelId: 'par',
          displayId: '007020000000',
          label: 'from parent lot 007020000000, before the 2027 subdivision',
          records: [{ ...record, recordId: 'r2', title: 'Old shed permit' }],
        },
      ],
      sourcesRegistered: 1,
    }
    render(<RecordsSection history={history} parcelHrefBase="/staff/parcels/" />)
    expect(screen.getByRole('link', { name: '007020000000' }).getAttribute('href')).toBe(
      '/staff/parcels/par',
    )
    expect(screen.getByRole('link', { name: '007030000000' }).getAttribute('href')).toBe(
      '/staff/parcels/src',
    )
  })
})
