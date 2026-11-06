// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { ImportUploadForm } from '@/components/staff/ImportUploadForm'

const refresh = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

afterEach(() => {
  cleanup()
  refresh.mockClear()
  vi.unstubAllGlobals()
})

function submitFile() {
  render(
    <CsrfProvider token="t">
      <ImportUploadForm layerKey="parcels" primary />
    </CsrfProvider>,
  )
  const file = new File(['{}'], 'parcels.geojson', { type: 'application/json' })
  fireEvent.change(screen.getByLabelText(/^File( \*)?$/), { target: { files: [file] } })
  fireEvent.submit(
    screen.getByRole('button', { name: 'Run import' }).closest('form') as HTMLFormElement,
  )
}

describe('ImportUploadForm', () => {
  it('refreshes the page after a finished upload so the layer card shows the new success time', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({ json: () => Promise.resolve({ runId: 'r1' }) }))
    submitFile()
    await waitFor(() => expect(screen.getByText(/View the run report/)).toBeTruthy())
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh after a failed upload', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ json: () => Promise.resolve({ error: 'too_large' }) }),
    )
    submitFile()
    await waitFor(() => expect(screen.getByText(/larger than 100 MB/)).toBeTruthy())
    expect(refresh).not.toHaveBeenCalled()
  })

  it('says an empty file is empty', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ json: () => Promise.resolve({ error: 'empty' }) }),
    )
    submitFile()
    await waitFor(() =>
      expect(screen.getByText('That file is empty. Choose a file with content.')).toBeTruthy(),
    )
  })

  it('offers only the files the chosen format can read', () => {
    render(
      <CsrfProvider token="t">
        <ImportUploadForm layerKey="parcels" primary />
      </CsrfProvider>,
    )
    const picker = screen.getByLabelText(/^File( \*)?$/)
    expect(picker.getAttribute('accept')).toContain('.geojson')
    expect(picker.getAttribute('accept')).not.toContain('.zip')
    fireEvent.change(screen.getByLabelText('File format'), { target: { value: 'file_shapefile' } })
    expect(picker.getAttribute('accept')).toBe('.zip,application/zip')
  })
})
