// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ActionForm } from '@/components/ActionForm'
import { CsrfProvider } from '@/components/CsrfProvider'

afterEach(cleanup)

const ok = () => Promise.resolve({ ok: true as const, message: 'ok' })

describe('ActionForm submit note', () => {
  it('sits beside the submit button, outside the status line', () => {
    render(
      <CsrfProvider token="t1">
        <ActionForm action={ok} submitLabel="Post comment" submitNote="Posted comments are final.">
          <span />
        </ActionForm>
      </CsrfProvider>,
    )
    const note = screen.getByText('Posted comments are final.')
    const button = screen.getByRole('button', { name: 'Post comment' })
    expect(note.parentElement).toBe(button.parentElement)
    expect(note.getAttribute('role')).toBeNull()
  })

  it('renders nothing extra without a note', () => {
    const { container } = render(
      <CsrfProvider token="t1">
        <ActionForm action={ok} submitLabel="Save">
          <span />
        </ActionForm>
      </CsrfProvider>,
    )
    const row = screen.getByRole('button', { name: 'Save' }).parentElement
    expect(row?.querySelectorAll('p')).toHaveLength(1)
    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })
})
