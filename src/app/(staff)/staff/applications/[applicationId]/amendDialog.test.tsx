// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { AmendFormData } from '@/features/applications/amendForm'
import type { ActionResult } from '@/server/actionRunner'
import { AmendApplicationDialog } from './amendDialog'

afterEach(cleanup)

const DATA: AmendFormData = {
  applicationId: '00000000-0000-4000-8000-000000000001',
  number: 'BP-2027-0003',
  form: {
    key: 'bp-form',
    label: 'Building permit form',
    fields: [
      { key: 'description', label: 'Description of work', type: 'textarea', required: true },
      {
        key: 'after_the_fact',
        label: 'After the fact',
        type: 'checkbox',
        required: false,
        staffOnly: true,
      },
    ],
  },
  values: { description: 'Garage addition', after_the_fact: true },
}

function open(reply: ActionResult) {
  const save = vi.fn((_form: FormData) => Promise.resolve(reply))
  render(
    <CsrfProvider token="t">
      <AmendApplicationDialog data={DATA} save={save} />
    </CsrfProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Edit the application' }))
  return save
}

describe('AmendApplicationDialog', () => {
  it('opens with the current answers, staff-only questions included', () => {
    open({ ok: true, message: 'Application updated.' })
    expect(screen.getByDisplayValue('Garage addition')).toBeTruthy()
    expect(screen.getByText('After the fact')).toBeTruthy()
  })

  it('sends every answer, including the ones that did not change', async () => {
    const save = open({ ok: true, message: 'Application updated.' })
    fireEvent.change(screen.getByDisplayValue('Garage addition'), {
      target: { value: 'Garage and deck' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    const sent = save.mock.calls.at(-1)?.[0]
    expect(JSON.parse(sent?.get('values') as string)).toEqual({
      description: 'Garage and deck',
      after_the_fact: true,
    })
    expect(sent?.get('applicationId')).toBe(DATA.applicationId)
  })

  it('shows a refused answer beside its question', async () => {
    open({
      ok: false,
      error: 'Check the highlighted answers.',
      fieldErrors: { description: 'Answer this question.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Answer this question.')).toBeTruthy()
  })
})
