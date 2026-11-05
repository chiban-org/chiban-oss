// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const noop = vi.hoisted(() => () => undefined)
const handlers = vi.hoisted(() => new Map<string, () => void>())
const created = vi.hoisted(() => [] as Record<string, unknown>[])
const failing = vi.hoisted(() => ({ construct: false }))

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))
vi.mock('maplibre-gl', () => {
  class FakeMap {
    constructor(options: Record<string, unknown>) {
      if (failing.construct) throw new Error('WebGL is not available')
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
const { MAP_LOAD_TIMEOUT_MS, PARCEL_TILE_MIN_ZOOM } = await import('@/components/map/mapStyle')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  handlers.clear()
  created.length = 0
  failing.construct = false
})

function watchLoadTimeout(): () => void {
  const spy = vi.spyOn(globalThis, 'setTimeout')
  return () => {
    const call = spy.mock.calls.find(([, ms]) => ms === MAP_LOAD_TIMEOUT_MS)
    const fire = call?.[0]
    if (typeof fire !== 'function') throw new Error('no load timeout was set')
    act(() => fire())
  }
}

const NOT_LOADED = 'The map did not load. Reload the page to try again, or search for the parcel.'

describe('ParcelMap loading state', () => {
  it('says the map is loading until the first tiles are drawn', async () => {
    render(<ParcelMap layers={[]} onSelect={noop} />)
    expect(screen.getByRole('status').textContent).toBe('Loading the map')
    await waitFor(() => expect(handlers.has('idle')).toBe(true))
    handlers.get('idle')?.()
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })
})

describe('ParcelMap load failure', () => {
  it('says the map did not load when it has not finished in time', async () => {
    const timeOut = watchLoadTimeout()
    render(<ParcelMap layers={[]} onSelect={noop} />)
    await waitFor(() => expect(created).toHaveLength(1))
    timeOut()
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(NOT_LOADED))
    expect(screen.queryByText('Loading the map')).toBeNull()
  })

  it('clears the failure once the map does finish drawing', async () => {
    const timeOut = watchLoadTimeout()
    render(<ParcelMap layers={[]} onSelect={noop} />)
    await waitFor(() => expect(handlers.has('idle')).toBe(true))
    timeOut()
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    act(() => handlers.get('idle')?.())
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('says the map did not load when the map cannot be created', async () => {
    failing.construct = true
    render(<ParcelMap layers={[]} onSelect={noop} />)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(NOT_LOADED))
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
