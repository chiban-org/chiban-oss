// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RecordsSection } from '@/components/parcels/RecordsSection'
import type { ParcelHistory } from '@/features/parcels/parcelHistory'
import type { ParcelRecordSummary } from '@/features/parcels/recordSources'
import { buildRecordTable, parcelFilesOf } from '@/features/parcels/recordTable'
import type { TownOffice } from '@/features/town/publicTown'
import type { CivilDate } from '@/types/civilDate'

afterEach(cleanup)

const OFFICE: TownOffice = {
  officeName: 'Land Use Office',
  addressLines: [],
  phone: '603-555-0100',
  email: '',
  officeHours: '',
}

const d = (s: string) => s as CivilDate

const permit: ParcelRecordSummary = {
  kind: 'application',
  recordId: 'a1',
  title: 'Building permit',
  number: 'BP-2026-0004',
  status: { label: 'Certificate of occupancy issued November 4, 2026', chip: 'passed' },
  date: null,
  href: null,
  closed: false,
  dates: { filed: d('2026-03-02'), issued: null, expires: null, closed: d('2026-03-20') },
}

function file(id: string, owner: { kind: string; id: string }, extra = {}): ParcelRecordSummary {
  return {
    kind: 'document',
    recordId: id,
    title: `Plan ${id}`,
    number: 'Site plan',
    status: { label: 'Public', chip: 'neutral' },
    date: d('2026-03-03'),
    dates: { filed: d('2026-03-03'), issued: null, expires: null, closed: null },
    href: `/api/documents/${id}?as=public`,
    owner,
    ...extra,
  }
}

function renderHistory(history: Omit<ParcelHistory, 'sourcesRegistered'>) {
  const full = { ...history, sourcesRegistered: 3 }
  return render(
    <RecordsSection
      table={buildRecordTable(full, 'p1')}
      parcelFiles={parcelFilesOf(full, 'p1')}
      office={OFFICE}
    />,
  )
}

describe('RecordsSection', () => {
  it('says where older paper files may be, with the office phone, when nothing is on file', () => {
    renderHistory({ own: [], ancestral: [] })
    expect(
      screen.getByText(
        'No records on file for this parcel. Older paper files may be at the Land Use Office, 603-555-0100.',
      ),
    ).toBeTruthy()
    expect(document.body.textContent).not.toContain('Chiban')
  })

  it('shows one row per application with its type, number, status, dates and documents beneath', () => {
    renderHistory({ own: [permit, file('f1', { kind: 'application', id: 'a1' })], ancestral: [] })
    const row = screen.getByText('Building permit').closest('li')
    if (row === null) throw new Error('no row')
    expect(within(row).getByText('BP-2026-0004').className).toContain('whitespace-nowrap')
    expect(row.textContent).toContain('Certificate of occupancy issued November 4, 2026')
    expect(row.textContent).toContain('Filed March 2, 2026')
    expect(row.textContent).toContain('Decided March 20, 2026')
    const doc = within(row).getByRole('link', { name: 'Plan f1' })
    expect(doc.getAttribute('target')).toBe('_blank')
  })

  it('shows no visibility chip on documents, since everything here is public', () => {
    renderHistory({ own: [permit, file('f1', { kind: 'application', id: 'a1' })], ancestral: [] })
    expect(screen.queryByText('Public')).toBeNull()
  })

  it('lets a long status chip wrap, with no shrink-0 wrapper around it', () => {
    const { container } = renderHistory({ own: [permit], ancestral: [] })
    const chip = container.querySelector('[data-status="passed"]')
    expect(chip?.parentElement?.className ?? '').not.toContain('shrink-0')
  })

  it('folds only the files of a closed record, keeping the summary marker, and nothing when it has none', () => {
    const closed = { ...permit, recordId: 'a2', number: 'BP-2025-0001', closed: true }
    const bare = { ...permit, recordId: 'a3', number: 'BP-2024-0001', closed: true }
    const { container } = renderHistory({
      own: [closed, bare, file('f2', { kind: 'application', id: 'a2' })],
      ancestral: [],
    })
    const folds = container.querySelectorAll('details')
    expect(folds).toHaveLength(1)
    const summary = folds[0]?.querySelector('summary')
    expect(summary?.textContent).toBe('1 file')
    expect(summary?.className ?? '').not.toContain('flex')
    expect(screen.getByText('BP-2025-0001')).toBeTruthy()
  })

  it('heads records of a parent lot with a link to it, and labels carried-forward records', () => {
    renderHistory({
      own: [{ ...permit, carriedFrom: { parcelId: 'src', displayId: '007030000000' } }],
      ancestral: [
        {
          parcelId: 'par',
          displayId: '007020000000',
          label: 'from parent lot 007020000000, before the 2027 subdivision',
          records: [{ ...permit, recordId: 'a9', number: 'BP-2019-0002' }],
        },
      ],
    })
    expect(screen.getByRole('link', { name: '007020000000' }).getAttribute('href')).toBe(
      '/parcels/par',
    )
    expect(screen.getByText(/Carried forward from parcel/).textContent).toBe(
      'Carried forward from parcel 007030000000',
    )
  })

  it('lists files kept on the parcel itself', () => {
    renderHistory({
      own: [file('pf', { kind: 'parcel', id: 'p1' }, { title: 'Old card', parcelFile: true })],
      ancestral: [],
    })
    expect(screen.getByRole('heading', { name: 'Files on this parcel' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Old card' })).toBeTruthy()
  })
})
