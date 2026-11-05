// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FilePicker } from '@/components/ui/file-picker'

class FakeDataTransfer {
  held: File[] = []
  items = { add: (file: File) => this.held.push(file) }
  get files() {
    return this.held
  }
}

const createObjectURL = vi.fn((file: File) => `blob:${file.name}`)
const revokeObjectURL = vi.fn()

beforeEach(() => {
  vi.stubGlobal('DataTransfer', FakeDataTransfer)
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
})

const png = (name: string, size = 10) =>
  new File([new Uint8Array(size)], name, { type: 'image/png' })
const pdf = (name: string) => new File(['x'], name, { type: 'application/pdf' })

const input = (container: HTMLElement) =>
  container.querySelector('input[type="file"]') as HTMLInputElement
const names = (el: HTMLInputElement) => Array.from(el.files ?? []).map((f) => f.name)
const pick = (el: HTMLInputElement, files: File[]) => fireEvent.change(el, { target: { files } })

describe('FilePicker', () => {
  it('keeps a real named file input with the given attributes', () => {
    const { container } = render(
      <FilePicker
        id="photos"
        name="photos"
        accept="image/png"
        multiple
        required
        capture="environment"
      />,
    )
    const el = input(container)
    expect(el.id).toBe('photos')
    expect(el.name).toBe('photos')
    expect(el.accept).toBe('image/png')
    expect(el.multiple).toBe(true)
    expect(el.required).toBe(true)
    expect(el.getAttribute('capture')).toBe('environment')
  })

  it('shows the drop copy and the accepted types and size', () => {
    render(<FilePicker accept="image/jpeg,image/png" multiple maxSize={5 * 1024 * 1024} />)
    expect(screen.getByText('Drag files here or')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeTruthy()
    expect(screen.getByText(/JPEG, PNG/)).toBeTruthy()
    expect(screen.getByText(/5 MB/)).toBeTruthy()
  })

  it('lists picked files with name and size and keeps the input in sync', () => {
    const onFilesChange = vi.fn()
    const { container } = render(
      <FilePicker multiple accept="image/png" onFilesChange={onFilesChange} />,
    )
    pick(input(container), [png('a.png', 2048)])
    expect(screen.getByText('a.png')).toBeTruthy()
    expect(screen.getByText('2 KB')).toBeTruthy()
    expect(names(input(container))).toEqual(['a.png'])
    expect(onFilesChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'a.png' })])
  })

  it('adds dropped files to the existing ones', () => {
    const { container } = render(<FilePicker multiple accept="image/png" />)
    pick(input(container), [png('a.png')])
    const zone = container.querySelector('[data-slot="file-picker-dropzone"]') as HTMLElement
    fireEvent.drop(zone, { dataTransfer: { files: [png('b.png')] } })
    expect(names(input(container))).toEqual(['a.png', 'b.png'])
    expect(screen.getByText('b.png')).toBeTruthy()
  })

  it('shows an image thumbnail and revokes its object url on removal', () => {
    const { container } = render(<FilePicker multiple accept="image/png,application/pdf" />)
    pick(input(container), [png('a.png'), pdf('b.pdf')])
    expect(container.querySelectorAll('img').length).toBe(1)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Remove a.png' }))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:a.png')
  })

  it('removes a file and syncs the input', () => {
    const { container } = render(<FilePicker multiple accept="image/png" />)
    pick(input(container), [png('a.png'), png('b.png')])
    fireEvent.click(screen.getByRole('button', { name: 'Remove a.png' }))
    expect(screen.queryByText('a.png')).toBeNull()
    expect(names(input(container))).toEqual(['b.png'])
  })

  it('rejects a wrong type with an inline error and does not add it', () => {
    const onFilesChange = vi.fn()
    const { container } = render(
      <FilePicker accept="image/png" multiple onFilesChange={onFilesChange} />,
    )
    pick(input(container), [pdf('c.pdf'), png('a.png')])
    expect(screen.getByRole('alert').textContent).toContain('c.pdf')
    expect(screen.queryByText('c.pdf', { selector: 'span' })).toBeNull()
    expect(names(input(container))).toEqual(['a.png'])
  })

  it('accepts by extension and wildcard accept tokens', () => {
    const { container } = render(<FilePicker accept=".csv,image/*" multiple />)
    pick(input(container), [new File(['x'], 'rows.CSV', { type: '' }), png('a.png'), pdf('c.pdf')])
    expect(names(input(container))).toEqual(['rows.CSV', 'a.png'])
    expect(screen.getByRole('alert').textContent).toContain('c.pdf')
  })

  it('rejects a file over maxSize', () => {
    const { container } = render(<FilePicker accept="image/png" multiple maxSize={1024} />)
    pick(input(container), [png('big.png', 2048), png('ok.png', 100)])
    expect(screen.getByRole('alert').textContent).toContain('big.png')
    expect(names(input(container))).toEqual(['ok.png'])
  })

  it('replaces the file in single mode and keeps the old one when the new one is rejected', () => {
    const { container } = render(<FilePicker accept="image/png" />)
    pick(input(container), [png('a.png')])
    pick(input(container), [png('b.png')])
    expect(names(input(container))).toEqual(['b.png'])
    pick(input(container), [pdf('c.pdf')])
    expect(names(input(container))).toEqual(['b.png'])
    expect(screen.getByText('b.png')).toBeTruthy()
  })

  it('ignores drops while disabled', () => {
    const { container } = render(<FilePicker multiple disabled />)
    const zone = container.querySelector('[data-slot="file-picker-dropzone"]') as HTMLElement
    fireEvent.drop(zone, { dataTransfer: { files: [png('a.png')] } })
    expect(screen.queryByText('a.png')).toBeNull()
  })

  it('marks the drop area while a drag is over it', () => {
    const { container } = render(<FilePicker multiple />)
    const zone = container.querySelector('[data-slot="file-picker-dropzone"]') as HTMLElement
    fireEvent.dragOver(zone, { dataTransfer: { files: [] } })
    expect(zone.getAttribute('data-dragging')).toBe('true')
    fireEvent.dragLeave(zone)
    expect(zone.getAttribute('data-dragging')).toBe('false')
  })

  it('passes aria-invalid through to the input', () => {
    const { container } = render(<FilePicker aria-invalid />)
    expect(input(container).getAttribute('aria-invalid')).toBe('true')
  })
})
