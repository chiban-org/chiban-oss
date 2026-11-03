// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { d, key, row, selectedNumber, setup } from '@/components/queue/queueTestKit'
import { findIsoDates } from '@/test/leaks'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const scrollIntoView = vi.fn()

beforeEach(() => {
  scrollIntoView.mockReset()
  Element.prototype.scrollIntoView = scrollIntoView
})
afterEach(cleanup)

describe('QueueTable selection and keys', () => {
  it('selects the first row on load so Enter opens it without j', () => {
    const first = row({ number: 'BP-2027-0001' })
    const navigate = setup([first, row({ number: 'BP-2027-0002' })])
    expect(selectedNumber()).toBe('BP-2027-0001')
    key('Enter')
    expect(navigate).toHaveBeenCalledWith(`/staff/applications/${first.applicationId}`)
  })

  it('j and k move the selection and Enter opens the selected application', () => {
    const a = row({ number: 'BP-2027-0001' })
    const b = row({ number: 'BP-2027-0002' })
    const navigate = setup([a, b])
    key('j')
    expect(selectedNumber()).toBe('BP-2027-0002')
    key('k')
    expect(selectedNumber()).toBe('BP-2027-0001')
    key('Enter')
    expect(navigate).toHaveBeenCalledWith(`/staff/applications/${a.applicationId}`)
  })

  it('clicking a row selects it and Enter then opens it', () => {
    const b = row({ number: 'BP-2027-0002', typeLabel: 'Plumbing permit' })
    const navigate = setup([row({ number: 'BP-2027-0001' }), b])
    fireEvent.click(screen.getByText('Plumbing permit, 007001000000'))
    expect(selectedNumber()).toBe('BP-2027-0002')
    key('Enter')
    expect(navigate).toHaveBeenCalledWith(`/staff/applications/${b.applicationId}`)
  })

  it('j scrolls the newly selected row into view', () => {
    setup([row({ number: 'BP-2027-0001' }), row({ number: 'BP-2027-0002' })])
    expect(scrollIntoView).not.toHaveBeenCalled()
    key('j')
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    expect(scrollIntoView.mock.contexts[0]).toBe(document.querySelector('tbody tr:nth-child(2)'))
  })

  it('a focused checkbox does not swallow j, and Enter on it does not open a row', () => {
    const navigate = setup([row({ number: 'BP-2027-0001' }), row({ number: 'BP-2027-0002' })])
    const box = document.createElement('input')
    box.type = 'checkbox'
    document.body.append(box)
    key('j', box)
    expect(selectedNumber()).toBe('BP-2027-0002')
    key('Enter', box)
    expect(navigate).not.toHaveBeenCalled()
    box.remove()
  })

  it('Enter on a focused button or link outside the table does not open a row', () => {
    const navigate = setup([row({})])
    const button = document.createElement('button')
    const link = document.createElement('a')
    link.href = '/elsewhere'
    document.body.append(button, link)
    key('Enter', button)
    key('Enter', link)
    expect(navigate).not.toHaveBeenCalled()
    button.remove()
    link.remove()
  })

  it('keys typed into a text field do not trigger shortcuts', () => {
    const navigate = setup([row({}), row({})])
    const input = document.createElement('input')
    document.body.append(input)
    key('j', input)
    key('Enter', input)
    expect(navigate).not.toHaveBeenCalled()
    expect(document.querySelector('tbody tr:nth-child(1)')?.getAttribute('aria-selected')).toBe(
      'true',
    )
    input.remove()
  })

  it('Escape in the search box gives focus back to the page', () => {
    setup([row({})])
    const search = document.createElement('input')
    search.id = 'queue-search'
    document.body.append(search)
    search.focus()
    key('Escape', search)
    expect(document.activeElement).not.toBe(search)
    search.remove()
  })

  it('/ moves focus to the search box', () => {
    setup([row({})])
    const search = document.createElement('input')
    search.id = 'queue-search'
    document.body.append(search)
    key('/')
    expect(document.activeElement).toBe(search)
    search.remove()
  })
})

describe('QueueTable assigning', () => {
  it('a opens the assign reviewer dialog for the selected row', () => {
    setup([row({ number: 'BP-2027-0009' })])
    key('a')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Application BP-2027-0009')).toBeTruthy()
  })

  it('keys pressed while the dialog is open neither navigate nor move the selection', () => {
    const navigate = setup([row({ number: 'BP-2027-0001' }), row({ number: 'BP-2027-0002' })])
    key('a')
    const dialog = screen.getByRole('dialog')
    const close = dialog.querySelector('button') ?? dialog
    key('j', close)
    key('Enter', close)
    key('Enter', screen.getByRole('button', { name: 'Assign' }))
    expect(navigate).not.toHaveBeenCalled()
    expect(selectedNumber()).toBe('BP-2027-0001')
  })

  it('Unassigned is a button that opens the dialog for that row', () => {
    setup([row({ number: 'BP-2027-0001' }), row({ number: 'BP-2027-0002' })])
    fireEvent.click(screen.getAllByRole('button', { name: 'Unassigned' })[1] as HTMLElement)
    expect(screen.getByText('Application BP-2027-0002')).toBeTruthy()
  })

  it('without reviewers to choose, Unassigned is plain text and a does nothing', () => {
    setup([row({})], vi.fn(), [])
    expect(screen.queryByRole('button', { name: 'Unassigned' })).toBeNull()
    expect(screen.getByText('Unassigned')).toBeTruthy()
    key('a')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
