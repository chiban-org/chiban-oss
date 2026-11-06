// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { expectRefusalAfterSubmit } from '@/test/besideField'

afterEach(cleanup)

function Form({ withHintFirst }: { withHintFirst: boolean }) {
  const [failed, setFailed] = useState(false)
  return (
    <form>
      <div data-slot="field">
        <input
          aria-label="Amount"
          aria-invalid={failed}
          aria-describedby={failed ? (withHintFirst ? 'hint note' : 'note') : 'hint'}
        />
        <p id="hint">In dollars.</p>
        {failed ? <p id="note">Enter an amount.</p> : null}
      </div>
      <button type="button" onClick={() => setFailed(true)}>
        Save
      </button>
    </form>
  )
}

describe('refusal helpers', () => {
  it('finds the message when a hint id precedes it in aria-describedby', async () => {
    render(<Form withHintFirst />)
    await expectRefusalAfterSubmit(
      screen.getByRole('button', { name: 'Save' }),
      () => screen.getByLabelText('Amount'),
      'Enter an amount.',
    )
  })

  it('finds the message when it is the only described-by id', async () => {
    render(<Form withHintFirst={false} />)
    await expectRefusalAfterSubmit(
      screen.getByRole('button', { name: 'Save' }),
      () => screen.getByLabelText('Amount'),
      'Enter an amount.',
    )
  })

  it('fails when the message is not beside the control', async () => {
    render(<Form withHintFirst />)
    await expect(
      expectRefusalAfterSubmit(
        screen.getByRole('button', { name: 'Save' }),
        () => screen.getByLabelText('Amount'),
        'Something else.',
      ),
    ).rejects.toThrow()
  })
})
