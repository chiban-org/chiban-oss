// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MeetingSelect } from './meetingSelect'

afterEach(cleanup)

const OPTIONS = [
  {
    value: 'a',
    text: 'November 12 · meets the deadline',
    hint: 'This meeting meets the deadline.',
  },
  {
    value: 'b',
    text: 'November 25 · after the deadline',
    hint: 'This meeting is after the deadline.',
  },
]

function renderIn(defaultValue: string) {
  return render(
    <form aria-label="move">
      <MeetingSelect
        key={defaultValue}
        label="Meeting"
        options={OPTIONS}
        defaultValue={defaultValue}
      />
    </form>,
  )
}

describe('the meeting picker hint', () => {
  it('follows the chosen meeting', () => {
    renderIn('a')
    expect(screen.getByText('This meeting meets the deadline.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/^Meeting/), { target: { value: 'b' } })
    expect(screen.getByText('This meeting is after the deadline.')).toBeTruthy()
  })

  it('goes back with the select when the form resets after a submission', async () => {
    renderIn('a')
    fireEvent.change(screen.getByLabelText(/^Meeting/), { target: { value: 'b' } })
    await act(async () => {
      screen.getByRole<HTMLFormElement>('form', { name: 'move' }).reset()
      await Promise.resolve()
    })
    expect(screen.getByLabelText<HTMLSelectElement>(/^Meeting/).value).toBe('a')
    expect(screen.getByText('This meeting meets the deadline.')).toBeTruthy()
  })
})
