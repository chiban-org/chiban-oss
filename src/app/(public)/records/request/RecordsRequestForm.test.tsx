// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { RecordsRequestForm } from './RecordsRequestForm'

vi.mock('./actions', () => ({ submitRecordsRequestAction: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

afterEach(cleanup)

function emailField(): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(/Your email/)
}

describe('the public records request form', () => {
  it('fills in the email of a signed-in resident', () => {
    render(
      <CsrfProvider token="t1">
        <RecordsRequestForm email="wren.ashby@fernhollow.example" />
      </CsrfProvider>,
    )
    expect(emailField().value).toBe('wren.ashby@fernhollow.example')
  })

  it('leaves the email empty for a visitor who is not signed in', () => {
    render(
      <CsrfProvider token="t1">
        <RecordsRequestForm email={null} />
      </CsrfProvider>,
    )
    expect(emailField().value).toBe('')
  })
})
