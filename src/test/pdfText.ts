import * as mupdf from 'mupdf'

export function pdfPages(bytes: Uint8Array): Promise<string[]> {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf')
  const pages: string[] = []
  for (let i = 0; i < doc.countPages(); i += 1) {
    pages.push(doc.loadPage(i).toStructuredText('preserve-whitespace').asText())
  }
  return Promise.resolve(pages)
}

export async function pdfText(bytes: Uint8Array): Promise<string> {
  return (await pdfPages(bytes)).join('\n')
}
