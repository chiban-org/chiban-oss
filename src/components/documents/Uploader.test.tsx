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

  it('passes accept, capture, and the file label to the picker', () => {
    render(
      <CsrfProvider token="t1">
        <Uploader
          target={{ kind: 'inspection', id: 'i1' }}
          maxBytes={10 * MB}
          actions={{ createIntent: vi.fn(), finalize: vi.fn() }}
          onUploaded={vi.fn()}
          accept="image/jpeg,image/png"
          capture="environment"
          fileLabel="Photo"
        />
      </CsrfProvider>,
    )
    const input = screen.getByLabelText('Photo')
    expect(input.getAttribute('accept')).toBe('image/jpeg,image/png')
    expect(input.getAttribute('capture')).toBe('environment')
  })

  it('says an empty file is empty, not too large', () => {
    const createIntent = vi.fn()
    setup({ createIntent, finalize: vi.fn() })
    choose(file('blank.pdf', 0))
    expect(screen.getByText('That file is empty. Choose a file with content.')).toBeTruthy()
    expect(screen.queryByText(/larger than/)).toBeNull()
    expect(createIntent).not.toHaveBeenCalled()
  })

  it('clears an earlier error and the chosen file after a successful upload', async () => {
    const createIntent = vi.fn(() =>
      Promise.resolve({ ok: true as const, intentId: 'i1', url: 'u', headers: {} }),
    )
    const finalize = vi.fn(() => Promise.resolve({ ok: true as const }))
    const { onUploaded } = setup({ createIntent, finalize })
    choose(file('huge.pdf', 11 * MB))
    expect(screen.getByText('That file is larger than 10 MB.')).toBeTruthy()
    const before = screen.getByLabelText('File')
    choose(file('plans.pdf', 100))
    await waitFor(() => expect(onUploaded).toHaveBeenCalled())
    expect(screen.queryByText(/larger than/)).toBeNull()
    expect(screen.getByLabelText('File')).not.toBe(before)
  })

  it('gives each uploader on a page its own field ids', () => {
    const actions = { createIntent: vi.fn(), finalize: vi.fn() }
    render(
      <CsrfProvider token="t1">
        <Uploader
          target={{ kind: 'parcel', id: 'p1' }}
          maxBytes={MB}
          actions={actions}
          onUploaded={vi.fn()}
          fileLabel="Plan"
        />
        <Uploader
          target={{ kind: 'parcel', id: 'p1' }}
          maxBytes={MB}
          actions={actions}
          onUploaded={vi.fn()}
          fileLabel="Letter"
        />
      </CsrfProvider>,
    )
    const plan = screen.getByLabelText('Plan')
    const letter = screen.getByLabelText('Letter')
    expect(plan).not.toBe(letter)
    const titles = screen.getAllByLabelText('Name for this document')
    expect(titles).toHaveLength(2)
    expect(new Set(titles.map((t) => t.id)).size).toBe(2)
  })

  it('drops the choose-a-file message when a rejected file is picked next', () => {
    setup({ createIntent: vi.fn(), finalize: vi.fn() })
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
    expect(screen.getByText('Choose a file first.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('File'), {
      target: { files: [file('notes.txt', 10, 'text/plain')] },
    })
    expect(screen.getByRole('alert').textContent).toContain('notes.txt is not an accepted file type.')
    expect(screen.queryByText('Choose a file first.')).toBeNull()
  })
})
