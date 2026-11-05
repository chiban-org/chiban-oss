// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AmendmentText, InlineDiff, WordDiffPreview } from '@/components/config/TextDiff'

afterEach(cleanup)

describe('InlineDiff', () => {
  it('strikes removed words and marks added words', () => {
    const { container } = render(<InlineDiff before="carry 30 psf" after="carry 60 psf" />)
    expect(container.querySelector('del')?.textContent).toBe('30')
    expect(container.querySelector('ins')?.textContent).toBe('60')
    expect(container.textContent).toBe('carry 3060 psf')
  })
})

describe('WordDiffPreview', () => {
  it('shows only the word-level diff, not the two texts again', () => {
    render(<WordDiffPreview before="Roofs carry 30 psf." after="Roofs carry 60 psf." />)
    const preview = screen.getByRole('region', { name: 'What changed' })
    expect(preview.querySelector('del')?.textContent).toBe('30')
    expect(preview.querySelector('ins')?.textContent).toBe('60')
    expect(within(preview).queryByText('Roofs carry 30 psf.')).toBeNull()
  })
})

describe('AmendmentText', () => {
  it('shows only the town text when there is no state text', () => {
    render(<AmendmentText townText="Roofs carry 60 psf." />)
    expect(screen.getByText('Roofs carry 60 psf.')).toBeTruthy()
    expect(screen.queryByText('What changed')).toBeNull()
  })

  it('shows both texts and a word-level diff when both exist', () => {
    render(<AmendmentText stateText="Roofs carry 30 psf." townText="Roofs carry 60 psf." />)
    expect(screen.getByText('What changed')).toBeTruthy()
    const state = screen.getByRole('group', { name: 'State code text' })
    const town = screen.getByRole('group', { name: "Town's amended text" })
    expect(within(state).getByText('Roofs carry 30 psf.')).toBeTruthy()
    expect(within(town).getByText('Roofs carry 60 psf.')).toBeTruthy()
    const diff = screen.getByLabelText('Word by word')
    expect(diff.querySelector('del')?.textContent).toBe('30')
    expect(diff.querySelector('ins')?.textContent).toBe('60')
  })

  it('stacks on phones and goes side by side on wide screens', () => {
    const { container } = render(<AmendmentText stateText="a" townText="b" />)
    const columns = container.querySelector('[data-columns]')
    expect(columns?.className).toContain('grid-cols-1')
    expect(columns?.className).toContain('md:grid-cols-2')
  })

  it('shows only the state text when the town text is empty', () => {
    render(<AmendmentText stateText="Original." townText="" />)
    expect(screen.getByText('Original.')).toBeTruthy()
    expect(screen.queryByText('What changed')).toBeNull()
  })

  it('renders nothing when neither text exists', () => {
    const { container } = render(<AmendmentText />)
    expect(container.textContent).toBe('')
  })
})
