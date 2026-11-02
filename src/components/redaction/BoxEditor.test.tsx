// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BoxEditor } from '@/components/redaction/BoxEditor'
import {
  boxProblems,
  type EditorBox,
  moveBox,
  resizeBox,
  serializeBoxes,
} from '@/components/redaction/boxModel'

afterEach(cleanup)

const geometry = { page: 1, src: 'data:image/png;base64,AAAA', width: 612, height: 792 }
const EXEMPTIONS = [
  { key: 'nh.rtk.91a5.iv', label: 'RSA 91-A:5 IV: Privacy' },
  { key: 'other_law', label: 'Made confidential by another law' },
]
const base: EditorBox = {
  id: 'b1',
  page: 1,
  x0: 10,
  y0: 10,
  x1: 90,
  y1: 50,
  exemptionKey: 'nh.rtk.91a5.iv',
  otherCitation: '',
  explanation: 'The number is a private phone number.',
}

describe('box model', () => {
  it('a box without an exemption is a problem and a complete box is not', () => {
    expect(boxProblems([{ ...base, exemptionKey: '' }])).toEqual([
      'Box 1 on page 1: choose an exemption.',
    ])
    expect(boxProblems([base])).toEqual([])
    expect(boxProblems([])).toEqual(['Draw at least one box.'])
  })

  it('a short explanation and a missing other-law citation are problems', () => {
    expect(boxProblems([{ ...base, explanation: 'too short' }])).toHaveLength(1)
    expect(boxProblems([{ ...base, exemptionKey: 'other_law' }])).toEqual([
      'Box 1 on page 1: enter the law that makes the record confidential.',
    ])
  })

  it('arrow keys move and shift resizes within the page', () => {
    expect(moveBox(base, 4, 0, geometry)).toMatchObject({ x0: 14, x1: 94 })
    expect(moveBox(base, -100, 0, geometry)).toMatchObject({ x0: 0, x1: 80 })
    expect(resizeBox(base, 4, 4, geometry)).toMatchObject({ x0: 10, x1: 94, y1: 54 })
    expect(resizeBox(base, 10000, 0, geometry).x1).toBe(612)
  })

  it('serializes pdf boxes in points and image boxes in whole pixels', () => {
    expect(JSON.parse(serializeBoxes([base], 'pdf'))).toEqual([
      {
        pdf: { page: 1, x0: 10, y0: 10, x1: 90, y1: 50 },
        exemptionKey: 'nh.rtk.91a5.iv',
        explanation: 'The number is a private phone number.',
      },
    ])
    expect(JSON.parse(serializeBoxes([{ ...base, x0: 10.4, x1: 90.2 }], 'image'))[0].image).toEqual(
      {
        x: 10,
        y: 10,
        width: 80,
        height: 40,
      },
    )
  })
})

describe('BoxEditor', () => {
  it('BoxEditor refuses a box without an exemption', () => {
    render(<BoxEditor pages={[geometry]} exemptions={EXEMPTIONS} mode="pdf" />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a box to page 1' }))
    expect(screen.getByRole('alert').textContent).toContain('Box 1 on page 1: choose an exemption.')
  })

  it('a complete box fills the hidden field and clears the alert', () => {
    render(<BoxEditor pages={[geometry]} exemptions={EXEMPTIONS} mode="pdf" />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a box to page 1' }))
    fireEvent.change(screen.getByLabelText('Exemption'), { target: { value: 'nh.rtk.91a5.iv' } })
    fireEvent.change(screen.getByLabelText('How the exemption applies'), {
      target: { value: 'The number is a private phone number.' },
    })
    expect(screen.queryByRole('alert')).toBeNull()
    const hidden = document.querySelector('input[name="boxes"]') as HTMLInputElement
    expect(JSON.parse(hidden.value)).toHaveLength(1)
  })

  it('arrow keys move a focused box and Delete removes it', () => {
    render(<BoxEditor pages={[geometry]} exemptions={EXEMPTIONS} mode="pdf" />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a box to page 1' }))
    const box = screen.getByRole('group', { name: 'Box 1 on page 1' })
    const before = box.style.left
    fireEvent.keyDown(box, { key: 'ArrowRight' })
    expect(screen.getByRole('group', { name: 'Box 1 on page 1' }).style.left).not.toBe(before)
    fireEvent.keyDown(screen.getByRole('group', { name: 'Box 1 on page 1' }), { key: 'Delete' })
    expect(screen.queryByRole('group', { name: 'Box 1 on page 1' })).toBeNull()
  })
})

describe('BoxEditor page navigation', () => {
  const thirty = Array.from({ length: 30 }, (_, i) => ({ ...geometry, page: i + 1 }))

  it('pages past the first twelve can be reached and keep their boxes across pages', () => {
    render(<BoxEditor pages={thirty} exemptions={EXEMPTIONS} mode="pdf" />)
    expect(screen.queryByText('Page 13')).toBeNull()
    const next = screen.queryByRole('button', { name: 'Show pages 13 to 24' })
    expect(next).not.toBeNull()
    if (next !== null) fireEvent.click(next)
    expect(screen.queryByText('Page 13')).not.toBeNull()
    expect(screen.queryByText('Page 1')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add a box to page 13' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show pages 1 to 12' }))
    expect(screen.queryByText('Page 1')).not.toBeNull()
    expect(screen.queryByText('Box 1 on page 13')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show pages 25 to 30' }))
    expect(screen.queryByText('Page 30')).not.toBeNull()
  })
})

describe('BoxEditor submission', () => {
  it('an unfinished box is still sent, so the server never answers that no box was drawn', () => {
    const { container } = render(
      <BoxEditor pages={[geometry]} exemptions={EXEMPTIONS} mode="pdf" />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add a box to page 1' }))
    const hidden = container.querySelector('input[name="boxes"]') as HTMLInputElement
    expect(JSON.parse(hidden.value)).toHaveLength(1)
  })
})
