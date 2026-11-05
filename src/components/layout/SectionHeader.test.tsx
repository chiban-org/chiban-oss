// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SectionHeader } from './ListHeader'

afterEach(cleanup)

describe('SectionHeader', () => {
  it('renders the heading with its id so the section can be labelled by it', () => {
    render(<SectionHeader id="parks" title="Manufactured housing parks" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Manufactured housing parks' }).id).toBe(
      'parks',
    )
  })

  it('puts the lead line inside the header as a section lead the rhythm styles', () => {
    const { container } = render(
      <SectionHeader id="parks" title="Parks" lead="Notices go to the park owner." />,
    )
    const header = container.querySelector('[data-slot="section-header"]')
    const lead = header?.querySelector('[data-slot="section-lead"]')
    expect(lead?.textContent).toBe('Notices go to the park owner.')
  })

  it('renders no lead element when there is no lead', () => {
    const { container } = render(<SectionHeader id="parks" title="Parks" />)
    expect(container.querySelector('[data-slot="section-lead"]')).toBeNull()
  })

  it('keeps heading and lead together and puts the action after them, so it never splits them', () => {
    const { container } = render(
      <SectionHeader
        id="parks"
        title="Parks"
        lead="Notices go to the park owner."
        action={<button type="button">Add park</button>}
      />,
    )
    const heading = screen.getByRole('heading', { name: 'Parks' })
    const lead = container.querySelector('[data-slot="section-lead"]')
    const button = screen.getByRole('button', { name: 'Add park' })
    expect(lead?.parentElement).toBe(heading.parentElement)
    expect(button.parentElement).not.toBe(heading.parentElement)
    expect(heading.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(lead?.compareDocumentPosition(button)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })
})
