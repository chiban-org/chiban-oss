import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { labelLines } from '@/features/abutters/labels/labelLines'
import { AVERY_5160, AVERY_5163, labelOrigin } from '@/features/abutters/labels/labelSheets'
import { renderLabels } from '@/features/abutters/labels/renderLabels'
import { pdfPages, pdfText } from '@/test/pdfText'

const label = (n: number) => [`Owner ${String(n).padStart(2, '0')}`, `PO Box ${n}`, 'Alder Pond NH']

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount()
}

describe('label layout', () => {
  it('31 recipients on avery_5160 render 2 pages', async () => {
    const bytes = await renderLabels(
      AVERY_5160,
      Array.from({ length: 31 }, (_, i) => label(i)),
    )
    expect(await pageCount(bytes)).toBe(2)
  })

  it('30 recipients fit one page', async () => {
    expect(
      await pageCount(
        await renderLabels(
          AVERY_5160,
          Array.from({ length: 30 }, (_, i) => label(i)),
        ),
      ),
    ).toBe(1)
  })

  it('first 5160 label origin is (13.5, 36) from the top left and the third column starts at 409.5', () => {
    expect(labelOrigin(AVERY_5160, 0)).toEqual({ page: 0, xPt: 13.5, yFromTopPt: 36 })
    expect(labelOrigin(AVERY_5160, 2).xPt).toBe(409.5)
    expect(labelOrigin(AVERY_5160, 3)).toEqual({ page: 0, xPt: 13.5, yFromTopPt: 108 })
    expect(labelOrigin(AVERY_5160, 30)).toEqual({ page: 1, xPt: 13.5, yFromTopPt: 36 })
  })

  it('5163 places 10 labels per page', async () => {
    expect(labelOrigin(AVERY_5163, 9).page).toBe(0)
    expect(labelOrigin(AVERY_5163, 10).page).toBe(1)
    expect(
      await pageCount(
        await renderLabels(
          AVERY_5163,
          Array.from({ length: 11 }, (_, i) => label(i)),
        ),
      ),
    ).toBe(2)
  })

  it('an empty list renders one blank page', async () => {
    expect(await pageCount(await renderLabels(AVERY_5160, []))).toBe(1)
  })

  it('labels are sorted by name', async () => {
    const text = await pdfText(await renderLabels(AVERY_5160, [label(3), label(1), label(2)]))
    expect(text.indexOf('Owner 01')).toBeLessThan(text.indexOf('Owner 02'))
    expect(text.indexOf('Owner 02')).toBeLessThan(text.indexOf('Owner 03'))
  })

  it('a long name shrinks before it is truncated', async () => {
    const long = 'A'.repeat(40)
    const text = await pdfText(await renderLabels(AVERY_5160, [[long, 'PO Box 1']]))
    expect(text).toContain('...')
    const medium = 'Quillfeather-Bramblewick Family Trust'
    const page = (await pdfPages(await renderLabels(AVERY_5160, [[medium, 'PO Box 1']])))[0] ?? ''
    expect(page).toContain(medium)
  })

  it('a name outside WinAnsi renders without throwing', async () => {
    const bytes = await renderLabels(AVERY_5160, [['Łukasz Żółć 日本', 'PO Box 1']])
    expect(await pageCount(bytes)).toBe(1)
  })
})

describe('labelLines', () => {
  it('labelLines splits "PO Box 105, Alder Pond NH" into two lines under the name', () => {
    expect(labelLines('Dana Whitcomb', 'PO Box 105, Alder Pond NH')).toEqual([
      'Dana Whitcomb',
      'PO Box 105',
      'Alder Pond NH',
    ])
  })

  it('splits on newlines when the address has them', () => {
    expect(labelLines('Dana', '12 Osprey Lane, Unit 4\nAlder Pond NH 03999')).toEqual([
      'Dana',
      '12 Osprey Lane, Unit 4',
      'Alder Pond NH 03999',
    ])
  })

  it('a five-line address keeps 4 lines', () => {
    const lines = labelLines('Dana', 'Line one\nLine two\nLine three\nLine four\nLine five')
    expect(lines).toHaveLength(4)
    expect(lines[3]).toBe('Line three Line four Line five')
  })
})
