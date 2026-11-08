// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ParcelRecordsPanel } from '@/components/parcels/ParcelRecordsPanel'
import { buildRecordTable } from '@/features/parcels/recordTable'
import { arrangeRecordTable, readRecordTableView } from '@/features/parcels/recordTableView'
import { caseRecord, dates, file, history, PARCEL, PATH, permit } from '@/test/recordTableFixtures'
import type { CivilDate } from '@/types/civilDate'

afterEach(cleanup)

function renderPanel(own = history([])) {
  const records = arrangeRecordTable(buildRecordTable(own, PARCEL), readRecordTableView({}), PATH)
  render(<ParcelRecordsPanel records={records} parcelHrefBase="/staff/parcels/" />)
}

const sample = history([
  permit('a1', 'EL-0003', {
    dates: dates({ filed: '2026-11-02', issued: '2026-11-04', expires: '2027-11-04' }),
  }),
  file('d1', { kind: 'application', id: 'a1' }, '2026-11-02'),
  file('d2', { kind: 'application', id: 'a1' }, '2026-11-03', {
    status: { label: 'Public', chip: 'neutral' },
  }),
  caseRecord('c1', {
    closed: true,
    status: { label: 'Closed', chip: 'neutral' },
    dates: dates({ filed: '2026-01-02', closed: '2026-03-04' }),
  }),
])

describe('ParcelRecordsPanel', () => {
  it('says so when the parcel has no records', () => {
    renderPanel()
    expect(screen.getByText('No records for this parcel are in Chiban yet.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows one row per record with its dates and muted empty cells', () => {
    renderPanel(sample)
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    const first = rows[1]
    if (first === undefined) throw new Error('no row')
    expect(within(first).getByRole('link', { name: 'EL-0003' }).getAttribute('href')).toBe(
      '/staff/applications/a1',
    )
    expect(within(first).getByText('Nov 2, 2026')).toBeTruthy()
    expect(within(first).getByText('Nov 4, 2027')).toBeTruthy()
    expect(within(first).getByText('None').className).toContain('text-muted-foreground')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('mutes closed rows instead of hiding them', () => {
    renderPanel(sample)
    const closedRow = screen.getByText('EC-c1').closest('tr')
    expect(closedRow?.hasAttribute('data-closed')).toBe(true)
    expect(closedRow?.className).toContain('text-muted-foreground')
    expect(screen.getByText('EL-0003').closest('tr')?.hasAttribute('data-closed')).toBe(false)
  })

  it('expands a record to list its files with kind, visibility and date added', () => {
    renderPanel(sample)
    const toggle = screen.getByRole('button', { name: '2 files' })
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    expect(list?.closest('tr')?.hidden).toBe(true)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(list?.hidden).toBe(false)
    const files = within(screen.getByRole('list', { name: 'Files on EL-0003' })).getAllByRole(
      'listitem',
    )
    expect(files.map((f) => f.querySelector('a')?.textContent)).toEqual(['File d2', 'File d1'])
    expect(within(files[0] as HTMLElement).getByText('Public')).toBeTruthy()
    expect(within(files[0] as HTMLElement).getByText('Added November 3, 2026')).toBeTruthy()
  })

  it('offers record kind and open or closed filters with counts', () => {
    renderPanel(sample)
    const filters = screen.getByRole('group', { name: 'Record filters' })
    expect(
      within(filters).getAllByRole('link', { name: /Electrical permit/ })[0]?.textContent,
    ).toBe('Electrical permit1')
    expect(
      within(filters)
        .getAllByRole('link', { name: /^Closed/ })[0]
        ?.getAttribute('href'),
    ).toBe(`${PATH}?state=closed#records`)
  })
})

describe('ParcelRecordsPanel inspection rows', () => {
  it('names each inspection by its type, with the permit number beside it and its scheduled date', () => {
    renderPanel(
      history([
        permit('i1', 'BP-2025-0001', {
          kind: 'inspection',
          title: 'Framing inspection',
          href: '/staff/inspections/i1',
          openAs: 'inspection_scheduled',
          scheduled: '2026-11-12' as CivilDate,
          dates: dates({ filed: '2026-11-02' }),
        }),
        permit('i2', 'BP-2025-0001', {
          kind: 'inspection',
          title: 'Footing inspection',
          href: '/staff/inspections/i2',
          closed: true,
          dates: dates({ filed: '2026-10-02', closed: '2026-10-05' }),
        }),
      ]),
    )
    const framing = screen.getByRole('link', { name: 'Framing inspection' })
    expect(framing.getAttribute('href')).toBe('/staff/inspections/i1')
    const row = framing.closest('tr') as HTMLElement
    expect(within(row).getByText('BP-2025-0001')).toBeTruthy()
    expect(within(row).getByText('Scheduled Nov 12, 2026')).toBeTruthy()
    const footing = screen.getByRole('link', { name: 'Footing inspection' }).closest('tr')
    expect(within(footing as HTMLElement).getByText('Oct 5, 2026')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'BP-2025-0001' })).toBeNull()
  })
})

describe('ParcelRecordsPanel ancestral records', () => {
  it('lists a parent lot’s records under its label with the row action', () => {
    const h = history(
      [],
      [
        {
          parcelId: 'p0',
          displayId: '007',
          label: 'from parent lot 007, before the 2027 subdivision',
          records: [{ ...permit('a9', 'BP-9'), linkId: 'link-9' }],
        },
      ],
    )
    const records = arrangeRecordTable(buildRecordTable(h, PARCEL), readRecordTableView({}), PATH)
    render(
      <ParcelRecordsPanel
        records={records}
        parcelHrefBase="/staff/parcels/"
        renderAction={(row) => <button type="button">{`Carry ${row.linkId ?? ''}`}</button>}
      />,
    )
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(
      'from parent lot 007, before the 2027 subdivision',
    )
    expect(screen.getByRole('link', { name: '007' }).getAttribute('href')).toBe('/staff/parcels/p0')
    expect(screen.getByRole('button', { name: 'Carry link-9' })).toBeTruthy()
  })
})
