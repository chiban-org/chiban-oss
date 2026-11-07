// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { ParcelFileUploader } from '@/components/documents/ParcelFileUploader'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.scrollIntoView = () => undefined
})
afterEach(cleanup)

const SERIES = [
  {
    key: 'nh.rs.correspondence_administrative',
    label: 'Correspondence: administrative',
    citation: 'RSA 33-A',
  },
  { key: 'nh.rs.septic_plans', label: 'Septic plans', citation: 'RSA 33-A' },
]
const actions = { createIntent: vi.fn(), finalize: vi.fn() }

function pickSeries(label: string) {
  fireEvent.pointerDown(screen.getByRole('combobox'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  fireEvent.click(screen.getByRole('option', { name: new RegExp(label) }))
}

function visibility(): string | null {
  const checked = screen
    .queryAllByRole('radio')
    .find((r) => r.getAttribute('aria-checked') === 'true')
  return checked?.getAttribute('value') ?? null
}

describe('ParcelFileUploader', () => {
  it('asks who can see the file, with correspondence private and plans public by default', () => {
    render(
      <CsrfProvider token="t1">
        <ParcelFileUploader parcelId="p1" series={SERIES} actions={actions} />
      </CsrfProvider>,
    )
    pickSeries('Correspondence')
    expect(visibility()).toBe('private')
    pickSeries('Septic plans')
    expect(visibility()).toBe('public')
  })

  it('says where a file shown on the public site appears', () => {
    render(
      <CsrfProvider token="t1">
        <ParcelFileUploader parcelId="p1" series={SERIES} actions={actions} />
      </CsrfProvider>,
    )
    pickSeries('Septic plans')
    expect(screen.getByRole('radio', { name: 'The public site, as uploaded' })).toBeTruthy()
    expect(
      screen.getByText(
        "A file shown on the public site appears on this parcel's public page, where anyone can download it.",
      ),
    ).toBeTruthy()
  })
})
