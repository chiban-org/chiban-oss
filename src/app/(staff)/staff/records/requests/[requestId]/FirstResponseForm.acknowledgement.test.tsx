// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { CivilDate } from '@/types/civilDate'
import { FirstResponseForm } from './FirstResponseForm'

vi.mock('../actions', () => ({ firstResponseAction: vi.fn() }))

afterEach(cleanup)

function renderForm(acknowledgement: boolean) {
  render(
    <CsrfProvider token="t1">
      <FirstResponseForm
        requestId="6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d"
        today={'2026-11-05' as CivilDate}
        canDeny={false}
        startOnRelease={false}
        releaseStep={<p>Release step here</p>}
        letterNote="The letter will be emailed."
        acknowledgement={acknowledgement}
      />
    </CsrfProvider>,
  )
}

const acknowledgeRadio = () => screen.queryByRole('radio', { name: /^Acknowledge receipt/ })

describe('acknowledgement choice', () => {
  it('is omitted when the pack does not accept an acknowledgement', () => {
    renderForm(false)
    expect(acknowledgeRadio()).toBeNull()
  })

  it('is offered with an optional question when the pack accepts one', () => {
    renderForm(true)
    const radio = acknowledgeRadio()
    expect(radio).not.toBeNull()
    if (radio === null) return
    fireEvent.click(radio)
    expect(screen.getByLabelText(/^Question for the requester/)).toBeTruthy()
  })
})
