// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TakeRequestPanel } from '@/components/inspections/TakeRequestPanel'
import { TakeBoardProvider, useTaken } from '@/components/inspections/takeRequestContext'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }))

afterEach(() => {
  cleanup()
  replace.mockClear()
})

function Finish() {
  const taken = useTaken()
  return (
    <button
      type="button"
      onClick={() => taken({ ok: true, message: 'Request taken.', createdId: 'i9' })}
    >
      Record
    </button>
  )
}

const entry = () => screen.getByRole('button', { name: 'Take a phone or counter request' })

describe('TakeRequestPanel', () => {
  it('starts closed with only the entry button', () => {
    render(
      <TakeRequestPanel defaultOpen={false}>
        <p>the form</p>
      </TakeRequestPanel>,
    )
    expect(entry().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('the form')).toBeNull()
    fireEvent.click(entry())
    expect(entry().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('the form')).toBeTruthy()
  })

  it('starts open when told a permit was asked for', () => {
    render(
      <TakeRequestPanel defaultOpen>
        <p>the form</p>
      </TakeRequestPanel>,
    )
    expect(screen.getByText('the form')).toBeTruthy()
  })

  it('closes, clears the permit from the address and tells the board when a request is taken', () => {
    const onTaken = vi.fn()
    render(
      <TakeBoardProvider value={{ onTaken, status: null }}>
        <TakeRequestPanel defaultOpen>
          <Finish />
        </TakeRequestPanel>
      </TakeBoardProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    expect(screen.queryByRole('button', { name: 'Record' })).toBeNull()
    expect(entry().getAttribute('aria-expanded')).toBe('false')
    expect(onTaken).toHaveBeenCalledWith('i9')
    expect(replace).toHaveBeenCalledWith('/staff/inspections', { scroll: false })
  })

  it('shows the board status line beside the entry button', () => {
    render(
      <TakeBoardProvider value={{ onTaken: vi.fn(), status: 'Request taken for X, Final.' }}>
        <TakeRequestPanel defaultOpen={false}>
          <p>the form</p>
        </TakeRequestPanel>
      </TakeBoardProvider>,
    )
    expect(screen.getByRole('status').textContent).toBe('Request taken for X, Final.')
  })
})
