// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { ONEDRIVE_STUB_NOTE } from '@/features/export/targets/oneDrive'

vi.mock('./actions', () => ({
  saveTargetAction: vi.fn(() =>
    Promise.resolve({
      ok: false,
      error: 'Enter the full path of the folder, starting with /.',
      fieldErrors: { root: 'Enter the full path of the folder, starting with /.' },
    }),
  ),
}))

const { AddTarget } = await import('./TargetForms')

afterEach(cleanup)

describe('Add a target', () => {
  it('offers the three kinds of storage and notes the OneDrive stand-in', () => {
    render(
      <CsrfProvider token="t1">
        <AddTarget />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add a target' }))
    const dialog = screen.getByRole('dialog')
    expect([...dialog.querySelectorAll('summary')].map((s) => s.textContent)).toEqual([
      'A folder on the server',
      'An S3 bucket',
      'A OneDrive or SharePoint drive',
    ])
    expect(dialog.textContent).toContain(ONEDRIVE_STUB_NOTE)
  })
})

describe('Add a folder target', () => {
  it('shows the folder refusal beside the Folder field', async () => {
    render(
      <CsrfProvider token="t1">
        <AddTarget />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add a target' }))
    fireEvent.click(screen.getByText('A folder on the server'))
    const folder = within(screen.getByRole('dialog').querySelectorAll('details')[0] as HTMLElement)
    fireEvent.change(folder.getByRole('textbox', { name: /^Name/ }), { target: { value: 'Town' } })
    fireEvent.change(folder.getByRole('textbox', { name: /^Folder on the server/ }), {
      target: { value: 'backups' },
    })
    fireEvent.click(folder.getByRole('button', { name: 'Add the folder' }))
    const root = await folder.findByRole('textbox', { name: /^Folder on the server/ })
    await waitFor(() => expect(root.getAttribute('aria-invalid')).toBe('true'))
    expect(root.closest('[data-slot="field"]')?.textContent).toContain(
      'Enter the full path of the folder, starting with /.',
    )
  })
})
