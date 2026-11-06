// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { RedactedUploader } from '@/components/documents/RedactedUploader'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

afterEach(cleanup)

function chooseAndUpload() {
  const pdf = new File([new Uint8Array(10)], 'redacted.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('File'), { target: { files: [pdf] } })
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
}

describe('RedactedUploader', () => {
  it("sends the document's record series with the upload request, which a parcel file needs", async () => {
    const createIntent = vi.fn((_form: FormData) =>
      Promise.resolve({ ok: false as const, error: 'stop here' }),
    )
    render(
      <CsrfProvider token="t">
        <RedactedUploader
          documentId="d1"
          target={{ kind: 'parcel', id: 'p1' }}
          seriesKey="nh.rs.building_permits"
          actions={{ createIntent, finalize: vi.fn() }}
        />
      </CsrfProvider>,
    )
    chooseAndUpload()
    await waitFor(() => expect(createIntent).toHaveBeenCalled())
    expect(createIntent.mock.calls[0]?.[0].get('seriesKey')).toBe('nh.rs.building_permits')
    expect(createIntent.mock.calls[0]?.[0].get('targetKind')).toBe('parcel')
  })

  it('sends no series when the document has none', async () => {
    const createIntent = vi.fn((_form: FormData) =>
      Promise.resolve({ ok: false as const, error: 'stop here' }),
    )
    render(
      <CsrfProvider token="t">
        <RedactedUploader
          documentId="d1"
          target={{ kind: 'application', id: 'a1' }}
          actions={{ createIntent, finalize: vi.fn() }}
        />
      </CsrfProvider>,
    )
    chooseAndUpload()
    await waitFor(() => expect(createIntent).toHaveBeenCalled())
    expect(createIntent.mock.calls[0]?.[0].get('seriesKey')).toBeNull()
  })
})
