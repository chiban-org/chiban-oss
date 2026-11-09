// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AnonymousReportForm } from './AnonymousReportForm'

afterEach(cleanup)

function photo(sizeMb: number): File {
  const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
  Object.defineProperty(file, 'size', { value: sizeMb * 1024 * 1024 })
  return file
}

function choose(files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[name="photos"]')
  if (input === null) throw new Error('no photo input')
  Object.defineProperty(input, 'files', { value: files, configurable: true })
}

function submit(): boolean {
  const form = document.querySelector('form')
  if (form === null) throw new Error('no form')
  return fireEvent.submit(form)
}

describe('AnonymousReportForm photo check', () => {
  it('stops photos that add up to more than the limit before they are sent', () => {
    render(<AnonymousReportForm />)
    choose([photo(40), photo(30)])
    expect(submit()).toBe(false)
    expect(screen.getByRole('alert').textContent).toBe(
      'The photos add up to more than 60 MB. Attach fewer or smaller photos.',
    )
  })

  it('stops more than five photos', () => {
    render(<AnonymousReportForm />)
    choose([photo(1), photo(1), photo(1), photo(1), photo(1), photo(1)])
    expect(submit()).toBe(false)
    expect(screen.getByRole('alert').textContent).toBe('Attach no more than 5 photos.')
  })

  it('lets a report with photos inside the limits go', () => {
    render(<AnonymousReportForm />)
    choose([photo(2), photo(3)])
    expect(submit()).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
