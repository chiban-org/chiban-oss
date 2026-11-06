// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { Uploader, type UploaderActions } from '@/components/documents/Uploader'

const success = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (message: string) => void success(message) } }))

afterEach(() => {
  cleanup()
  success.mockClear()
})

const intent = () => Promise.resolve({ ok: true as const, intentId: 'i1', url: 'u', headers: {} })

function upload(
  actions: UploaderActions,
  put: () => Promise<boolean> = () => Promise.resolve(true),
) {
  const onUploaded = vi.fn()
  render(
    <CsrfProvider token="t1">
      <Uploader
        target={{ kind: 'application', id: 'a1' }}
        maxBytes={1024}
        actions={actions}
        put={put}
        onUploaded={onUploaded}
      />
    </CsrfProvider>,
  )
  const chosen = new File([new Uint8Array(10)], 'plans.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('File'), { target: { files: [chosen] } })
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
  return onUploaded
}

describe('Uploader confirmation', () => {
  it('raises a notification that outlives the refresh once the upload is finalized', async () => {
    const onUploaded = upload({
      createIntent: intent,
      finalize: () => Promise.resolve({ ok: true as const }),
    })
    await waitFor(() => expect(success).toHaveBeenCalledWith('Uploaded.'))
    expect(success).toHaveBeenCalledTimes(1)
    expect(onUploaded).toHaveBeenCalled()
  })

  it('raises no notification when finalizing is refused', async () => {
    upload({
      createIntent: intent,
      finalize: () => Promise.resolve({ ok: false as const, error: 'Refused.' }),
    })
    await waitFor(() => expect(screen.getByText('Refused.')).toBeTruthy())
    expect(success).not.toHaveBeenCalled()
  })

  it('raises no notification when the transfer fails', async () => {
    upload({ createIntent: intent, finalize: vi.fn() }, () => Promise.resolve(false))
    await waitFor(() => expect(screen.getByText(/could not be sent/)).toBeTruthy())
    expect(success).not.toHaveBeenCalled()
  })
})
