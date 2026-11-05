// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { BoardSettingsEditor } from '@/components/config/BoardSettingsEditor'
import { BOARD_SETTINGS_DEFAULT } from '@/features/boards/boardSettingsSchema'

vi.mock('./intervalActions', () => ({ changeRecheckIntervalAction: vi.fn() }))

const { RecheckInterval } = await import('./RecheckInterval')

afterEach(cleanup)

function renderInterval(canEdit: boolean) {
  return render(
    <CsrfProvider token="tok">
      <RecheckInterval days={365} canEdit={canEdit} />
    </CsrfProvider>,
  )
}

describe('RecheckInterval', () => {
  it('states the interval', () => {
    renderInterval(false)
    expect(screen.getByText('Contacts are due for a check every 365 days.')).toBeTruthy()
  })

  it('names this a board setting with a version history, because Publish saves a new version', () => {
    renderInterval(false)
    expect(screen.queryByRole('link', { name: 'Board settings version history' })).toBeNull()
    cleanup()
    renderInterval(true)
    const link = screen.getByRole('link', { name: 'Board settings version history' })
    expect(link.getAttribute('href')).toBe('/staff/settings/board_settings')
    expect(screen.getByText(/saved as a version/)).toBeTruthy()
  })

  it('offers Change only to someone who can edit settings', () => {
    renderInterval(false)
    expect(screen.queryByRole('button', { name: /change/i })).toBeNull()
    cleanup()
    renderInterval(true)
    expect(screen.getByRole('button', { name: /change/i })).toBeTruthy()
  })

  it('opens a dialog with a days field of at least 1 and a plain hint', () => {
    renderInterval(true)
    fireEvent.click(screen.getByRole('button', { name: /change/i }))
    const field = screen.getByLabelText<HTMLInputElement>(/^Days between checks( \*)?$/)
    expect(field.type).toBe('number')
    expect(field.min).toBe('1')
    expect(field.value).toBe('365')
    expect(screen.getByText(/Nothing is blocked/)).toBeTruthy()
  })
})

describe('BoardSettingsEditor', () => {
  it('no longer shows the re-check interval', () => {
    render(<BoardSettingsEditor body={BOARD_SETTINGS_DEFAULT} onChange={vi.fn()} errors={{}} />)
    expect(screen.queryByText('Notice contacts')).toBeNull()
    expect(screen.queryByLabelText(/Re-check notice contacts/)).toBeNull()
  })
})
