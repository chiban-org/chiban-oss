// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { UploadedChoiceSelect } from './UploadedChoiceSelect'
import { UploadPair, useUploadPair } from './UploadPair'

afterEach(cleanup)

const first: [string, string][] = [
  ['', 'Choose an uploaded proof'],
  ['d1', 'Return of service'],
]
const both: [string, string][] = [
  ...first,
  ['d3', 'Someone else upload'],
  ['d2', 'Affidavit of posting'],
]

function FinishUpload({ id }: { id: string }) {
  const pair = useUploadPair()
  return (
    <button type="button" onClick={() => pair?.uploaded(id)}>
      Finish upload
    </button>
  )
}

function ui(options: [string, string][]): ReactNode {
  return (
    <form>
      <UploadPair>
        <FinishUpload id="d2" />
        <UploadedChoiceSelect label="Proof of service" name="proof" options={options} />
      </UploadPair>
    </form>
  )
}

const select = () => screen.getByLabelText<HTMLSelectElement>('Proof of service')

describe('a document choice next to its uploader', () => {
  it('chooses the document its own uploader added, even when another upload arrived too', () => {
    const { rerender } = render(ui(first))
    fireEvent.click(screen.getByRole('button', { name: 'Finish upload' }))
    rerender(ui(both))
    expect(select().value).toBe('d2')
  })

  it('keeps the choice when a document arrives from another uploader on the page', () => {
    const { rerender } = render(ui(first))
    fireEvent.change(select(), { target: { value: 'd1' } })
    rerender(ui(both))
    expect(select().value).toBe('d1')
  })

  it('clears with its form and does not bring the old choice back', () => {
    const { rerender } = render(ui(first))
    fireEvent.click(screen.getByRole('button', { name: 'Finish upload' }))
    rerender(ui(both))
    select().form?.reset()
    rerender(ui([...both]))
    expect(select().value).toBe('')
  })
})
