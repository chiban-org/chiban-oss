// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ApplicationCell, DueCell, ReceivedCell } from '@/components/queue/QueueCells'
import { row } from '@/components/queue/queueTestKit'

afterEach(cleanup)

function cellOf(node: React.ReactElement): HTMLTableCellElement {
  const { container } = render(
    <table>
      <tbody>
        <tr>{node}</tr>
      </tbody>
    </table>,
  )
  const cell = container.querySelector('td')
  if (cell === null) throw new Error('no cell')
  return cell
}

describe('queue cells', () => {
  it('the due cell keeps a minimum width so its dates do not wrap', () => {
    expect(cellOf(<DueCell row={row({})} />).className).toContain('md:min-w-36')
  })

  it('the received cell keeps a minimum width so its date does not wrap', () => {
    expect(cellOf(<ReceivedCell row={row({})} />).className).toContain('md:min-w-24')
  })

  it('the application cell shows the first 80 characters of the description on a second line', () => {
    const description = `${'Rebuild the rear porch with new footings. '.repeat(4)}and add a railing.`
    const cell = cellOf(<ApplicationCell row={row({ description })} />)
    expect(cell.textContent).toContain(description.slice(0, 80))
    expect(cell.textContent).not.toContain(description.slice(0, 81))
  })

  it('the application cell shows no description line when there is none', () => {
    const cell = cellOf(<ApplicationCell row={row({})} />)
    expect(cell.querySelectorAll('span.block')).toHaveLength(2)
  })
})
