import { waitFor } from '@testing-library/react'
import { expect } from 'vitest'

export async function expectRefusalBeside(control: HTMLElement, message: string): Promise<void> {
  await waitFor(() => expect(control.getAttribute('aria-invalid')).toBe('true'))
  const note = document.getElementById(control.getAttribute('aria-describedby') ?? '')
  expect(note?.textContent).toBe(message)
  expect(control.closest('[data-slot="field"]')?.contains(note ?? null)).toBe(true)
}
