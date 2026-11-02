// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { Uploader, type UploaderActions } from '@/components/documents/Uploader'

afterEach(cleanup)

const MB = 1024 * 1024

function file(name: string, bytes: number, type = 'application/pdf'): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

function setup(actions: UploaderActions, put = vi.fn(() => Promise.resolve(true))) {
  const onUploaded = vi.fn()
  render(
    <CsrfProvider token="t1">
      <Uploader
        target={{ kind: 'application', id: 'a1' }}
        maxBytes={10 * MB}
        actions={actions}
        put={put}
        onUploaded={onUploaded}
      />
    </CsrfProvider>,
  )
  return { put, onUploaded }
}

function choose(f: File) {
  fireEvent.change(screen.getByLabelText('File'), { target: { files: [f] } })
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
}

describe('Uploader', () => {
  it("uploader shows the server's too-large message", async () => {
    const createIntent = vi.fn(() =>
      Promise.resolve({ ok: false as const, error: 'That file is larger than 100 MB.' }),
    )
    const finalize = vi.fn()
    setup({ createIntent, finalize })
    choose(file('plans.pdf', 100))
    await waitFor(() => expect(screen.getByText('That file is larger than 100 MB.')).toBeTruthy())
    expect(finalize).not.toHaveBeenCalled()
  })

  it('refuses a file over the limit before asking the server', () => {
    const createIntent = vi.fn()
    setup({ createIntent, finalize: vi.fn() })
    choose(file('huge.pdf', 11 * MB))
    expect(screen.getByText('That file is larger than 10 MB.')).toBeTruthy()
    expect(createIntent).not.toHaveBeenCalled()
  })

  it('asks for the intent, sends the bytes straight to storage, then finalizes', async () => {
    const createIntent = vi.fn((_form: FormData) =>
      Promise.resolve({
        ok: true as const,
        intentId: 'i1',
        url: 'https://storage.example/put',
        headers: { 'content-type': 'application/pdf' },
      }),
    )
    const finalize = vi.fn((_form: FormData) => Promise.resolve({ ok: true as const }))
    const { put, onUploaded } = setup({ createIntent, finalize })
    choose(file('plans.pdf', 100))
    await waitFor(() => expect(onUploaded).toHaveBeenCalled())
    expect(createIntent.mock.calls[0]?.[0].get('filename')).toBe('plans.pdf')
    expect(createIntent.mock.calls[0]?.[0].get('sizeBytes')).toBe('100')
    expect(put).toHaveBeenCalled()
    expect(finalize.mock.calls[0]?.[0].get('intentId')).toBe('i1')
  })

  it('reports a failed transfer and does not finalize', async () => {
    const createIntent = vi.fn(() =>
      Promise.resolve({ ok: true as const, intentId: 'i1', url: 'u', headers: {} }),
    )
    const finalize = vi.fn()
    setup(
      { createIntent, finalize },
      vi.fn(() => Promise.resolve(false)),
    )
    choose(file('plans.pdf', 100))
    await waitFor(() => expect(screen.getByText(/could not be sent/)).toBeTruthy())
    expect(finalize).not.toHaveBeenCalled()
  })
})
