// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ContactRows } from './ContactRows'

afterEach(cleanup)

describe('ContactRows', () => {
  it('shows what is on file after a save brings back new values', () => {
    const { rerender } = render(
      <form>
        <ContactRows
          kind="officer"
          initial={[{ name: 'Dana Whitcomb', middle: 'President', mailingAddress: 'PO Box 105' }]}
        />
      </form>,
    )
    rerender(
      <form>
        <ContactRows
          kind="officer"
          initial={[{ name: 'Lee Marsh', middle: 'President', mailingAddress: 'PO Box 106' }]}
        />
      </form>,
    )
    const row = screen.getByRole('group', { name: 'Officer 1' })
    expect(within(row).getByLabelText<HTMLInputElement>('Name').value).toBe('Lee Marsh')
    expect(within(row).getByLabelText<HTMLInputElement>('Name').defaultValue).toBe('Lee Marsh')
  })
})
