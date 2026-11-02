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

const props = { timeZone: 'America/New_York', overlays: [] as ('roads' | 'water')[], basemap: null }

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

  it('retired parcel shows "Retired April 12, 2027" and links to its children', () => {
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
                eventKind: 'subdivision',
                effectiveDate: '2027-04-12' as CivilDate,
              },
            ],
          },
        })}
        {...props}
      />,
    )
    expect(screen.getByText('Retired April 12, 2027')).toBeTruthy()
    expect(container.textContent).toContain('subdivision effective April 12, 2027')
    expect(findIsoDates(container.textContent)).toEqual([])
    const link = screen.getByRole('link', { name: '007020001000' })
    expect(link.getAttribute('href')).toBe('/parcels/c1')
  })

  it('labels retired ids and omits the mailing address', () => {
    const { container } = render(
      <PublicParcelDetail
        view={view({ ids: [{ label: 'Map-lot ID', value: '007020000000', retired: true }] })}
        {...props}
      />,
    )
    expect(screen.getByText('007020000000 (retired ID)')).toBeTruthy()
    expect(container.textContent).not.toContain('Mailing')
  })

  it('puts the search box before the facts', () => {
    const { container } = render(<PublicParcelDetail view={view()} {...props} />)
    const html = container.innerHTML
    expect(html.indexOf('role="search"')).toBeLessThan(html.indexOf('12 Heron Cove Road'))
  })
})
