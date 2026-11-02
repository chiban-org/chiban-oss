// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppealGraph, type GraphNode } from '@/components/appeals/AppealGraph'
import { findIsoDates } from '@/test/leaks'

afterEach(cleanup)

const base: GraphNode = {
  nodeId: 'a',
  kindLabel: 'Planning Board decision',
  dateText: 'June 9, 2027',
  outcomeText: 'Approved',
  status: 'open',
  untimely: false,
  parentId: null,
  window: {
    label: 'Court appeal of a Planning Board decision',
    dueText: 'July 9, 2027',
    consequence: 'An appeal filed after this date is untimely (RSA 677:15 I).',
  },
}

describe('AppealGraph', () => {
  it('labels a stayed petition', () => {
    render(
      <AppealGraph
        nodes={[
          base,
          {
            ...base,
            nodeId: 'b',
            parentId: 'a',
            kindLabel: 'Court petition',
            status: 'stayed',
            window: null,
            outcomeText: null,
          },
        ]}
      />,
    )
    const item = screen.getByText('Court petition').closest('li') as HTMLElement
    expect(within(item).getByText('Stayed')).toBeTruthy()
  })

  it('labels an untimely filing', () => {
    render(<AppealGraph nodes={[{ ...base, untimely: true, kindLabel: 'Court petition' }]} />)
    expect(screen.getByText('Filed late')).toBeTruthy()
  })

  it("shows each window's due date and consequence", () => {
    render(<AppealGraph nodes={[base]} />)
    expect(
      screen.getByText(/Court appeal of a Planning Board decision, due July 9, 2027/),
    ).toBeTruthy()
    expect(screen.getByText(/An appeal filed after this date is untimely/)).toBeTruthy()
  })

  it('nests a child under its parent', () => {
    render(
      <AppealGraph
        nodes={[
          base,
          { ...base, nodeId: 'b', parentId: 'a', kindLabel: 'Court petition', window: null },
        ]}
      />,
    )
    const parent = screen.getByText('Planning Board decision').closest('li') as HTMLElement
    expect(within(parent).getByText('Court petition')).toBeTruthy()
  })

  it('shows an empty message with no nodes and never an ISO date', () => {
    const { container, rerender } = render(<AppealGraph nodes={[]} />)
    expect(container.textContent).toContain('No decisions or appeals are recorded yet.')
    rerender(<AppealGraph nodes={[base]} />)
    expect(findIsoDates(container.textContent)).toEqual([])
  })
})
