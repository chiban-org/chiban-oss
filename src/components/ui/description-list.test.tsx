// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DescriptionList } from './description-list'

afterEach(cleanup)

const ITEMS = [
  { label: 'Starts', value: 'Board vote on October 20, 2026' },
  { label: 'Due', value: <strong>October 27, 2026</strong> },
]

describe('DescriptionList', () => {
  it('pairs each label with its value in order', () => {
    const { container } = render(<DescriptionList items={ITEMS} />)
    const terms = [...container.querySelectorAll('dt')].map((dt) => dt.textContent)
    const values = [...container.querySelectorAll('dd')].map((dd) => dd.textContent)
    expect(terms).toEqual(['Starts', 'Due'])
    expect(values).toEqual(['Board vote on October 20, 2026', 'October 27, 2026'])
  })

  it('groups each pair in its own row so rows keep their spacing when stacked', () => {
    const { container } = render(<DescriptionList items={ITEMS} />)
    const rows = container.querySelectorAll('dl > div')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.querySelector('dt')?.nextElementSibling?.tagName).toBe('DD')
  })

  it('marks itself so the shared label column and muted label style apply', () => {
    const { container } = render(<DescriptionList items={ITEMS} />)
    const dl = container.querySelector('dl')
    expect(dl?.getAttribute('data-slot')).toBe('description-list')
    expect(container.querySelector('dt')?.className).toContain('text-muted-foreground')
  })

  it('takes a wider label column for long labels', () => {
    const { container } = render(<DescriptionList items={ITEMS} labelWidth="wide" />)
    expect(container.querySelector('dl')?.getAttribute('data-label-width')).toBe('wide')
  })

  it('leaves out rows whose value is missing', () => {
    const { container } = render(
      <DescriptionList items={[...ITEMS, { label: 'Extension', value: null }]} />,
    )
    expect(container.querySelectorAll('dt')).toHaveLength(2)
  })
})
