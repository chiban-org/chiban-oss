// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NewestChoiceSelect } from './NewestChoiceSelect'

afterEach(cleanup)

const first: [string, string][] = [
  ['', 'Choose an uploaded proof'],
  ['d1', 'Return of service'],
]

describe('a document choice next to its uploader', () => {
  it('chooses the document just uploaded and keeps the choice otherwise', () => {
    const { rerender } = render(
      <NewestChoiceSelect label="Proof of service" name="proof" options={first} />,
    )
    const select = () => screen.getByLabelText<HTMLSelectElement>('Proof of service')
    expect(select().value).toBe('')
    rerender(<NewestChoiceSelect label="Proof of service" name="proof" options={[...first]} />)
    expect(select().value).toBe('')
    rerender(
      <NewestChoiceSelect
        label="Proof of service"
        name="proof"
        options={[...first, ['d2', 'Affidavit of posting']]}
      />,
    )
    expect(select().value).toBe('d2')
  })
})
