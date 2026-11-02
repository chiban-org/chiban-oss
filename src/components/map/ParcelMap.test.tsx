// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const noop = vi.hoisted(() => () => undefined)
const handlers = vi.hoisted(() => new Map<string, () => void>())
const created = vi.hoisted(() => [] as Record<string, unknown>[])

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))
vi.mock('maplibre-gl', () => {
  class FakeMap {
    constructor(options: Record<string, unknown>) {
      created.push(options)
    }
    on(event: string, a: unknown, b?: unknown) {
      const handler = typeof a === 'function' ? a : b
      if (typeof handler === 'function' && typeof a === 'string') return
      if (typeof handler === 'function') handlers.set(event, handler as () => void)
    }
    once(event: string, handler: () => void) {
      handlers.set(event, handler)
    }
    addControl = noop
    getCanvas() {
      return { style: {} }
    }
    fitBounds = noop
    remove = noop
    isStyleLoaded() {
      return false
    }
  }
  class FakeControl {}
  return { default: {}, Map: FakeMap, NavigationControl: FakeControl, setWorkerUrl: noop }
})

const { ParcelMap } = await import('@/components/map/ParcelMap')
const { PARCEL_TILE_MIN_ZOOM } = await import('@/components/map/mapStyle')

afterEach(() => {
  cleanup()
  handlers.clear()
  created.length = 0
})

describe('ParcelMap loading state', () => {
  it('says the map is loading until the first tiles are drawn', async () => {
    render(<ParcelMap layers={[]} onSelect={noop} />)
    expect(screen.getByRole('status').textContent).toBe('Loading the map')
    await waitFor(() => expect(handlers.has('idle')).toBe(true))
    handlers.get('idle')?.()
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })
})

describe('ParcelMap zoom', () => {
  it('never zooms out past the zoom where parcel tiles start, so a wide town is not a blank map', async () => {
    render(<ParcelMap layers={[]} onSelect={noop} bbox={[-71.61, 43.87, -71.54, 44.15]} />)
    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0]?.minZoom).toBe(PARCEL_TILE_MIN_ZOOM)
    expect(created[0]?.zoom).toBeGreaterThanOrEqual(PARCEL_TILE_MIN_ZOOM)
  })
})

describe('ParcelMap hint', () => {
  it('a map without a search box gives its own keyboard hint', () => {
    render(<ParcelMap layers={[]} onSelect={noop} hint="The tables below list every parcel." />)
    expect(screen.getByText('The tables below list every parcel.')).toBeTruthy()
    expect(screen.queryByText(/search box/)).toBeNull()
  })
})
