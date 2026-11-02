// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const noop = vi.hoisted(() => () => undefined)
const handlers = vi.hoisted(() => new Map<string, () => void>())

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))
vi.mock('maplibre-gl', () => {
  class FakeMap {
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

afterEach(() => {
  cleanup()
  handlers.clear()
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

describe('ParcelMap hint', () => {
  it('a map without a search box gives its own keyboard hint', () => {
    render(<ParcelMap layers={[]} onSelect={noop} hint="The tables below list every parcel." />)
    expect(screen.getByText('The tables below list every parcel.')).toBeTruthy()
    expect(screen.queryByText(/search box/)).toBeNull()
  })
})
