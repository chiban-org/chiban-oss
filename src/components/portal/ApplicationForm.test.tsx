// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApplicationForm } from '@/components/portal/ApplicationForm'
import { useLiveAnswers } from '@/components/portal/liveAnswers'
import type { FormBody } from '@/features/forms/formSchema'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

afterEach(cleanup)

const FORM: FormBody = {
  key: 'dw',
  label: 'Driveway',
  fields: [
    { key: 'road_name', label: 'Road the driveway meets', type: 'text', required: true },
    { key: 'culvert', label: 'Culvert needed', type: 'checkbox', required: false },
  ],
}

const REFUSED = {
  ok: false as const,
  error: 'Check the highlighted fields and try again.',
  fieldErrors: {
    road_name: 'This is required.',
    attest: 'Check the box to confirm the information is true.',
  },
}

function renderForm(submit = vi.fn(() => Promise.resolve(REFUSED)), extra = {}) {
  render(
    <ApplicationForm
      applicationId="a1"
      form={FORM}
      initialValues={{}}
      attestationText="I attest this is true."
      attestationSha256="h"
      actions={{ save: vi.fn(), submit }}
      {...extra}
    />,
  )
  return submit
}

describe('ApplicationForm', () => {
  it('leads the form with a focused summary that links to every refused field', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))
    const summary = await screen.findByRole('alert')
    await waitFor(() => expect(summary.contains(document.activeElement)).toBe(true))
    const links = screen.getAllByRole('link', { name: /This is required|Check the box/ })
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['#field-road_name', '#attest'])
    expect(summary.compareDocumentPosition(screen.getByLabelText(/Road the driveway meets/))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('clears a field error as soon as the field changes', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))
    await screen.findByRole('alert')
    const road = screen.getByLabelText(/Road the driveway meets/)
    expect(road.getAttribute('aria-invalid')).toBe('true')
    fireEvent.change(road, { target: { value: 'Moose Hill Road' } })
    expect(road.getAttribute('aria-invalid')).toBe('false')
    expect(screen.queryByRole('link', { name: /This is required/ })).toBeNull()
  })

  it('shares the live answers with the documents placed between the form and the submit area', () => {
    function Echo() {
      const answers = useLiveAnswers()
      return <p data-testid="echo">{String(answers?.culvert)}</p>
    }
    renderForm(undefined, { documents: <Echo /> })
    expect(screen.getByTestId('echo').textContent).toBe('undefined')
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(screen.getByTestId('echo').textContent).toBe('true')
    const echo = screen.getByTestId('echo')
    expect(
      echo.compareDocumentPosition(screen.getByRole('button', { name: 'Submit application' })),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('lists the documents still missing from the live answers', () => {
    renderForm(undefined, {
      requirements: [
        {
          label: 'Culvert plan',
          requiredIf: { field: 'culvert', op: 'is_true' },
          optional: false,
          settled: false,
        },
      ],
    })
    expect(screen.queryByText(/Before you submit, add/)).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    expect(screen.getByText(/Before you submit, add: Culvert plan/)).toBeTruthy()
  })
})
