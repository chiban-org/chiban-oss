// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { ONEDRIVE_STUB_NOTE } from '@/features/export/targets/oneDrive'

vi.mock('./actions', () => ({ saveTargetAction: vi.fn() }))

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
