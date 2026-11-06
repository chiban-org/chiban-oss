import { PDFDocument, type PDFFont } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { embedFonts, type Fonts } from '@/features/pdf/pdfFonts'
import { wrapLines } from '@/features/pdf/pdfLayout'
import { layoutRuns } from '@/features/pdf/pdfRichText'

const SIZE = 10.5
const WIDTH = 300
const UNBROKEN = 'x'.repeat(5000)
const MEASURED_CHARACTER_BUDGET = 400_000

interface Meter {
  measured: number
}

function metered(font: PDFFont, meter: Meter): PDFFont {
  return new Proxy(font, {
    get(target, key, receiver) {
      if (key === 'widthOfTextAtSize') {
        return (text: string, size: number) => {
          meter.measured += text.length
          return target.widthOfTextAtSize(text, size)
        }
      }
      return Reflect.get(target, key, receiver) as unknown
    },
  })
}

async function meteredFonts(meter: Meter): Promise<Fonts> {
  const fonts = await embedFonts(await PDFDocument.create())
  return {
    heading: metered(fonts.heading, meter),
    body: metered(fonts.body, meter),
    bold: metered(fonts.bold, meter),
    italic: metered(fonts.italic, meter),
  }
}

describe('wrapping a 5000 character word with no spaces', () => {
  it('splits it into lines that fit, losing nothing, within a bounded amount of measuring', async () => {
    const meter: Meter = { measured: 0 }
    const { body } = await meteredFonts(meter)
    const lines = wrapLines(UNBROKEN, body, SIZE, WIDTH)
    expect(meter.measured).toBeLessThan(MEASURED_CHARACTER_BUDGET)
    expect(lines.join('')).toBe(UNBROKEN)
    for (const line of lines) expect(body.widthOfTextAtSize(line, SIZE)).toBeLessThanOrEqual(WIDTH)
    expect(lines.length).toBeGreaterThan(1)
  })

  it('splits it in rich text the same way, within the same budget', async () => {
    const meter: Meter = { measured: 0 }
    const fonts = await meteredFonts(meter)
    const lines = layoutRuns([{ text: UNBROKEN }], fonts, SIZE, WIDTH)
    expect(meter.measured).toBeLessThan(MEASURED_CHARACTER_BUDGET)
    expect(lines.map((line) => line.map((p) => p.text).join('')).join('')).toBe(UNBROKEN)
    for (const line of lines) {
      const width = line.reduce((sum, p) => sum + p.font.widthOfTextAtSize(p.text, SIZE), 0)
      expect(width).toBeLessThanOrEqual(WIDTH)
    }
  })
})
