import { fireEvent, waitFor } from '@testing-library/react'
import { expect } from 'vitest'

export async function expectRefusalBeside(
  submit: HTMLElement,
  control: () => HTMLElement,
  message: string,
): Promise<void> {
  fireEvent.click(submit)
  await waitFor(() => expect(control().getAttribute('aria-invalid')).toBe('true'))
  const described = (control().getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent)
  expect(described).toContain(message)
}

export function refusal(field: string, error: string) {
  return { ok: false as const, error, fieldErrors: { [field]: error } }
}
