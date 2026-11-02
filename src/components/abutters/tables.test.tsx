// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CandidateTable } from '@/components/abutters/CandidateTable'
import { RecipientTable } from '@/components/abutters/RecipientTable'
import type { CandidateRow, RecipientView } from '@/features/abutters/listView'
import { findIsoDates, findRawKeys } from '@/test/leaks'

afterEach(cleanup)

const candidate = (overrides: Partial<CandidateRow>): CandidateRow => ({
  parcelId: 'p1',
  parcelLabel: '009002000000',
  owner: 'Wren, Isolde',
  noticeTo: null,
  reasons: ['Touches the property'],
  staffSelected: false,
  excluded: false,
  exclusionReason: null,
  ...overrides,
})

const recipient = (overrides: Partial<RecipientView>): RecipientView => ({
  id: 'r1',
  name: 'Wren, Isolde',
  mailingAddress: 'PO Box 302, Alder Pond NH 03999',
  roles: ['Abutting owner'],
  statusText: 'Complete',
  provenance: ['Parcel layer imported March 1, 2027, 23 days old'],
  excluded: false,
  exclusionReason: null,
  needsDecision: false,
  tenantDecided: false,
  decisionText: null,
  corrected: false,
  ...overrides,
})

describe('CandidateTable', () => {
  it('a park parcel keeps its landowner and says notice goes to the park owner', () => {
    render(
      <CandidateTable
        rows={[
          candidate({
            owner: 'Alder Land Trust',
            noticeTo: 'Heron Park LLC',
          }),
        ]}
      />,
    )
    expect(screen.queryByText('Alder Land Trust')).not.toBeNull()
    expect(
      screen.queryByText(
        'Notice goes to Heron Park LLC, the park owner named on the manufactured housing park roster.',
      ),
    ).not.toBeNull()
  })

  it('CandidateTable lists staff selections first', () => {
    render(
      <CandidateTable
        rows={[
          candidate({ parcelId: 'a', parcelLabel: '009002000000' }),
          candidate({
            parcelId: 'b',
            parcelLabel: '009011000000',
            staffSelected: true,
            reasons: ['Added by staff across the street: Across the road'],
          }),
        ]}
      />,
    )
    const cells = screen.getAllByRole('row').map((r) => r.textContent)
    const staffAt = cells.findIndex((c) => c.includes('009011000000'))
    const otherAt = cells.findIndex((c) => c.includes('009002000000'))
    expect(staffAt).toBeGreaterThan(-1)
    expect(staffAt).toBeLessThan(otherAt)
    expect(screen.getByText('Added by staff')).toBeTruthy()
    expect(screen.getByText("Found by the town's rules")).toBeTruthy()
  })

  it('says so when nothing was found', () => {
    render(<CandidateTable rows={[]} />)
    expect(screen.getByText(/No parcels were found/)).toBeTruthy()
  })

  it('shows why a parcel was left off', () => {
    render(
      <CandidateTable
        rows={[candidate({ excluded: true, exclusionReason: 'Corner point only' })]}
      />,
    )
    expect(screen.getByText('Left off the list: Corner point only')).toBeTruthy()
  })

  it('renders no key or date', () => {
    const { container } = render(<CandidateTable rows={[candidate({})]} />)
    expect(findIsoDates(container.textContent)).toEqual([])
    expect(findRawKeys(container.textContent, ['adjacent', 'staff_selected'])).toEqual([])
  })
})

describe('RecipientTable', () => {
  it('RecipientTable shows incomplete_data with its reason in words', () => {
    render(
      <RecipientTable
        rows={[recipient({ mailingAddress: null, statusText: 'Missing name or address' })]}
      />,
    )
    expect(screen.getByText('Missing name or address')).toBeTruthy()
    expect(screen.getByText('No mailing address on record')).toBeTruthy()
  })

  it('every row shows where its data came from', () => {
    render(<RecipientTable rows={[recipient({})]} />)
    expect(screen.getByText('Parcel layer imported March 1, 2027, 23 days old')).toBeTruthy()
  })

  it('shows a staff decision', () => {
    render(
      <RecipientTable
        rows={[recipient({ decisionText: 'Counts as an abutter: Owns the home on site 4' })]}
      />,
    )
    expect(screen.getByText('Counts as an abutter: Owns the home on site 4')).toBeTruthy()
  })

  it('says so when nobody is on the list', () => {
    render(<RecipientTable rows={[]} />)
    expect(screen.getByText('Nobody is on this list yet.')).toBeTruthy()
  })
})
