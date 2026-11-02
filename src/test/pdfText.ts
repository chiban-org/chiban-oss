import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'

const HEX_STRING = /<([0-9A-Fa-f\s]+)>\s*Tj/g
const LITERAL_STRING = /\(((?:\\.|[^\\)])*)\)\s*Tj/g

function hexToLatin1(hex: string): string {
  const clean = hex.replace(/\s+/g, '')
  let out = ''
  for (let i = 0; i + 1 < clean.length; i += 2) {
    out += String.fromCharCode(Number.parseInt(clean.slice(i, i + 2), 16))
  }
  return out
}

export async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((page) => {
    const contents = page.node.get(PDFName.of('Contents'))
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents]
    let text = ''
    for (const ref of refs) {
      const stream = doc.context.lookup(ref)
      if (!(stream instanceof PDFRawStream)) continue
      const decoded = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')
      for (const m of decoded.matchAll(HEX_STRING)) text += `${hexToLatin1(m[1] ?? '')}\n`
      for (const m of decoded.matchAll(LITERAL_STRING)) text += `${m[1] ?? ''}\n`
    }
    return text
  })
}

export async function pdfText(bytes: Uint8Array): Promise<string> {
  return (await pdfPages(bytes)).join('\n')
}
