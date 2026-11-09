// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PublicParcelDetail } from '@/components/parcels/PublicParcelDetail'
import type { LayerStatus } from '@/features/gis/layerStatus'
import type { PublicParcelView } from '@/features/parcels/publicParcelView'
import { findIsoDates } from '@/test/leaks'
import type { CivilDate } from '@/types/civilDate'

vi.mock('@/components/map/LinkedParcelMap', () => ({ LinkedParcelMap: () => <div>map</div> }))

afterEach(cleanup)

const layer = (state: LayerStatus['state']): LayerStatus => ({
  key: 'parcels',
  state,
  lastSuccessAt: '2027-01-01T15:00:00.000Z',
  lastFailureAt: state === 'import_failed' ? '2027-02-01T15:00:00.000Z' : null,
  ageDays: 120,
  staleAfterDays: 90,
})

function view(over: Partial<PublicParcelView> = {}): PublicParcelView {
  return {
    parcelId: 'p1',
    status: 'active',
    retiredOn: null,
    ids: [{ label: 'Map-lot ID', value: '007001000000', retired: false }],
    siteAddress: { state: 'known', value: '12 Heron Cove Road', asOf: '2027-01-01T15:00:00.000Z' },
    owner: { state: 'known', value: 'Larkspur Family Trust', asOf: '2027-01-01T15:00:00.000Z' },
    areaAcres: { state: 'known', value: 1.38, asOf: '2027-01-01T15:00:00.000Z' },
    hasGeometry: true,
    lineage: { parents: [], children: [] },
    history: { own: [], ancestral: [], sourcesRegistered: 0 },
    layer: layer('fresh'),
    ...over,
  }
}

const props = {
  timeZone: 'America/New_York',
  overlays: [] as ('roads' | 'water')[],
  basemap: null,
  office: {
    officeName: 'Land Use Office',
    addressLines: [],
    phone: '',
    email: '',
    officeHours: '',
  },
}

describe('PublicParcelDetail', () => {
  it('public page shows stale banner', () => {
    render(<PublicParcelDetail view={view({ layer: layer('stale') })} {...props} />)
    expect(
      screen.getByText('Parcel data last imported January 1, 2027. It may be out of date.'),
    ).toBeTruthy()
  })

  it('shows no banner when the layer is fresh', () => {
    render(<PublicParcelDetail view={view()} {...props} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says so when the last import failed', () => {
    render(<PublicParcelDetail view={view({ layer: layer('import_failed') })} {...props} />)
    expect(screen.getByText(/latest update of parcel data failed/i)).toBeTruthy()
  })

  it('titles the page with the street address and lists the map-lot ID, owner and area as facts', () => {
    render(<PublicParcelDetail view={view()} {...props} />)
    expect(screen.getByRole('heading', { level: 1, name: '12 Heron Cove Road' })).toBeTruthy()
    const facts = document.querySelector('[data-slot="fact-list"]')
    expect(facts?.textContent).toContain('Map-lot ID007001000000')
    expect(facts?.textContent).toContain('Owner of recordLarkspur Family Trust')
    expect(facts?.textContent).toContain('Area1.38 acres')
  })

  it('titles a parcel with no address by its map-lot ID and says the address is missing', () => {
    render(<PublicParcelDetail view={view({ siteAddress: { state: 'unknown' } })} {...props} />)
    expect(screen.getByRole('heading', { level: 1, name: '007001000000' })).toBeTruthy()
    expect(screen.getByText('No site address on file')).toBeTruthy()
  })

  it('retired parcel shows a Retired chip and lists what it became', () => {
    const { container } = render(
      <PublicParcelDetail
        view={view({
          status: 'retired',
          retiredOn: '2027-04-12' as CivilDate,
          lineage: {
            parents: [],
            children: [
              {
                parcelId: 'c1',
                displayId: '007020001000',
                eventId: 'e',
                eventKind: 'lot_line_adjustment',
                effectiveDate: '2027-04-12' as CivilDate,
              },
            ],
          },
        })}
        {...props}
      />,
    )
    expect(screen.getByText('Retired April 12, 2027').closest('[data-status]')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'What this parcel became' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Where this parcel came from' })).toBeNull()
    expect(container.textContent).toContain('Lot-line adjustment effective April 12, 2027')
    expect(container.textContent).not.toContain('lot line adjustment')
    expect(findIsoDates(container.textContent)).toEqual([])
    expect(screen.getByRole('link', { name: '007020001000' }).getAttribute('href')).toBe(
      '/parcels/c1',
    )
  })

  it('labels retired ids and omits the mailing address', () => {
    const { container } = render(
      <PublicParcelDetail
        view={view({
          ids: [
            { label: 'Map-lot ID', value: '007001000000', retired: false },
            { label: 'Map-lot ID', value: '007020000000', retired: true },
          ],
        })}
        {...props}
      />,
    )
    expect(container.textContent).toContain('007020000000 (retired ID)')
    expect(container.textContent).not.toContain('Mailing')
  })

  it('folds the map below the records', () => {
    const { container } = render(<PublicParcelDetail view={view()} {...props} />)
    const html = container.innerHTML
    const fold = container.querySelector('details')
    expect(fold?.hasAttribute('open')).toBe(false)
    expect(html.indexOf('id="records-heading"')).toBeLessThan(html.indexOf('<details'))
  })
})
