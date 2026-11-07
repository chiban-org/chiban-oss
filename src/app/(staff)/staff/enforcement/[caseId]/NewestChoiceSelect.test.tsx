// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { NewestChoiceSelect } from './NewestChoiceSelect'
import { UploadPair, useUploadPair } from './UploadPair'

afterEach(cleanup)

const first: [string, string][] = [
  ['', 'Choose an uploaded proof'],
  ['d1', 'Return of service'],
]
const second: [string, string][] = [...first, ['d2', 'Affidavit of posting']]

function FinishUpload() {
  const pair = useUploadPair()
  return (
    <button type="button" onClick={() => pair?.arm()}>
      Finish upload
    </button>
  )
}

function ui(options: [string, string][]): ReactNode {
  return (
    <UploadPair>
      <FinishUpload />
      <NewestChoiceSelect label="Proof of service" name="proof" options={options} />
    </UploadPair>
  )
}

const select = () => screen.getByLabelText<HTMLSelectElement>('Proof of service')

describe('a document choice next to its uploader', () => {
  it('chooses the document its own uploader just added', () => {
    const { rerender } = render(ui(first))
    expect(select().value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Finish upload' }))
    rerender(ui(second))
    expect(select().value).toBe('d2')
  })

  it('keeps the choice when a document arrives from another uploader on the page', () => {
    const { rerender } = render(ui(first))
    fireEvent.change(select(), { target: { value: 'd1' } })
    rerender(ui(second))
    expect(select().value).toBe('d1')
  })
})
