// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SearchResult } from '@/features/search/searchTypes'
import { RECORD_SEARCH_LABEL, RecordSearch } from './RecordSearch'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

afterEach(() => {
  cleanup()
  push.mockClear()
})

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined
})

const PERMIT = {
  key: 'a1',
  href: '/staff/applications/a1',
  title: 'PL-2026-0005',
  detail: 'Plumbing permit, 4 Elm Street',
  chip: { status: 'passed' as const, label: 'Issued' },
  newTab: false,
}

const PARCEL = {
  key: 'p1',
  href: '/staff/parcels/p1',
  title: '007001000000',
  detail: '4 Elm Street, Avery Stone',
  chip: null,
  newTab: false,
}

function resultFor(query: string, exact: boolean): SearchResult {
  return {
    query,
    exact: exact
      ? { kind: 'application', number: PERMIT.title, href: PERMIT.href, newTab: false }
      : null,
    groups: [
      { key: 'applications', label: 'Applications', rows: [PERMIT], seeAll: null },
      { key: 'parcels', label: 'Parcels', rows: [PARCEL], seeAll: null },
    ],
  }
}

function fakeFind(exact: boolean) {
  return vi.fn((q: string, _signal: AbortSignal) => Promise.resolve(resultFor(q, exact)))
}

function box(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>('combobox', { name: RECORD_SEARCH_LABEL })
}

describe('RecordSearch', () => {
  it('goes straight to the record when Enter is pressed on an exact number', async () => {
    const find = fakeFind(true)
    render(<RecordSearch find={find} />)
    fireEvent.change(box(), { target: { value: 'pl-2026-0005' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
    await waitFor(() => expect(push).toHaveBeenCalledWith(PERMIT.href))
  })

  it('shows grouped matches after a pause', async () => {
    render(<RecordSearch find={fakeFind(false)} />)
    fireEvent.change(box(), { target: { value: 'Elm' } })
    const options = await screen.findAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('PL-2026-0005'),
      expect.stringContaining('007001000000'),
    ])
    expect(screen.getByRole('group', { name: 'Applications' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Parcels' })).toBeTruthy()
    expect(options[0]?.textContent).toContain('Issued')
  })

  it('picks a match with the arrow keys and Enter', async () => {
    render(<RecordSearch find={fakeFind(false)} />)
    fireEvent.change(box(), { target: { value: 'Elm' } })
    await screen.findAllByRole('option')
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    fireEvent.keyDown(box(), { key: 'Enter' })
    await waitFor(() => expect(push).toHaveBeenCalledWith(PARCEL.href))
  })

  it('opens the list instead of jumping when nothing matches the number exactly', async () => {
    render(<RecordSearch find={fakeFind(false)} />)
    fireEvent.change(box(), { target: { value: 'Elm' } })
    await screen.findAllByRole('option')
    fireEvent.keyDown(box(), { key: 'Escape' })
    await waitFor(() => expect(screen.queryAllByRole('option')).toHaveLength(0))
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(await screen.findAllByRole('option')).toHaveLength(2)
    expect(push).not.toHaveBeenCalled()
  })

  it('closes the list on Escape without leaving the field', async () => {
    render(<RecordSearch find={fakeFind(false)} />)
    fireEvent.change(box(), { target: { value: 'Elm' } })
    await screen.findAllByRole('option')
    fireEvent.keyDown(box(), { key: 'Escape' })
    await waitFor(() => expect(screen.queryAllByRole('option')).toHaveLength(0))
    expect(box().value).toBe('Elm')
  })
})
