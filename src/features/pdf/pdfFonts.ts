import { readFileSync } from 'node:fs'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import type { PDFDocument, PDFFont } from 'pdf-lib'

export interface Fonts {
  heading: PDFFont
  body: PDFFont
  bold: PDFFont
  italic: PDFFont
}

const FONT_DIR = path.resolve(process.cwd(), 'src/features/pdf/fonts')

const FONT_FILES = {
  heading: 'SourceSerif4-Semibold.ttf',
  body: 'Mulish-Regular.ttf',
  bold: 'Mulish-Bold.ttf',
  italic: 'Mulish-Italic.ttf',
} as const satisfies Record<keyof Fonts, string>

let fontBytes: Record<keyof Fonts, Uint8Array> | undefined

function loadFontBytes(): Record<keyof Fonts, Uint8Array> {
  fontBytes ??= {
    heading: readFileSync(path.join(FONT_DIR, FONT_FILES.heading)),
    body: readFileSync(path.join(FONT_DIR, FONT_FILES.body)),
    bold: readFileSync(path.join(FONT_DIR, FONT_FILES.bold)),
    italic: readFileSync(path.join(FONT_DIR, FONT_FILES.italic)),
  }
  return fontBytes
}

export async function embedFonts(doc: PDFDocument): Promise<Fonts> {
  doc.registerFontkit(fontkit)
  const bytes = loadFontBytes()
  return {
    heading: await doc.embedFont(bytes.heading, { subset: true }),
    body: await doc.embedFont(bytes.body, { subset: true }),
    bold: await doc.embedFont(bytes.bold, { subset: true }),
    italic: await doc.embedFont(bytes.italic, { subset: true }),
  }
}

const coverage = new WeakMap<PDFFont, ReadonlySet<number>>()

function coverageOf(font: PDFFont): ReadonlySet<number> {
  let held = coverage.get(font)
  if (held === undefined) {
    held = new Set(font.getCharacterSet())
    coverage.set(font, held)
  }
  return held
}

export const MISSING_GLYPH = '?'

export function printable(font: PDFFont, text: string): string {
  const covered = coverageOf(font)
  return [...text.normalize('NFC').replace(/[\r\n\t]+/g, ' ')]
    .map((char) => (covered.has(char.codePointAt(0) ?? 0) ? char : MISSING_GLYPH))
    .join('')
}
