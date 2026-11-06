import { fireEvent, waitFor } from '@testing-library/react'
import { expect } from 'vitest'

function describedBy(control: HTMLElement): HTMLElement[] {
  return (control.getAttribute('aria-describedby') ?? '').split(/\s+/).flatMap((id) => {
    const note = document.getElementById(id)
    return note === null ? [] : [note]
  })
}

export async function expectRefusalBeside(control: HTMLElement, message: string): Promise<void> {
  await waitFor(() => expect(control.getAttribute('aria-invalid')).toBe('true'))
  const note = describedBy(control).find((n) => n.textContent === message)
  expect(note?.textContent).toBe(message)
  expect(control.closest('[data-slot="field"]')?.contains(note ?? null)).toBe(true)
}

export async function expectGroupRefusal(member: HTMLElement, message: string): Promise<void> {
  await waitFor(() => expect(member.getAttribute('aria-invalid')).toBe('true'))
  const note = describedBy(member).find((n) => n.textContent === message)
  expect(note?.textContent).toBe(message)
  expect(member.closest('fieldset, form')?.contains(note ?? null)).toBe(true)
}

export async function expectRefusalAfterSubmit(
  submit: HTMLElement,
  control: () => HTMLElement,
  message: string,
): Promise<void> {
  fireEvent.click(submit)
  await waitFor(() => expect(control().getAttribute('aria-invalid')).toBe('true'))
  await expectRefusalBeside(control(), message)
}

export function refusal(field: string, error: string) {
  return { ok: false as const, error, fieldErrors: { [field]: error } }
}
