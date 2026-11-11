import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  MAX_RENDER_PIXELS,
  PREVIEW_WIDTH,
  renderImage,
  renderPdfPages,
} from '@/features/renditions/derive'

async function pdfWithPages(sizes: [number, number][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (const size of sizes) doc.addPage(size)
  return await doc.save()
}

async function pixelsOf(bytes: Uint8Array): Promise<number> {
  const meta = await sharp(bytes).metadata()
  return meta.width * meta.height
}

describe('rendering PDF pages for previews', () => {
  it('renders an ordinary letter page at the preview width', async () => {
    const rendered = renderPdfPages(await pdfWithPages([[612, 792]]))
    expect(rendered?.map((r) => [r.kind, r.page])).toEqual([
      ['thumbnail', 1],
      ['preview', 1],
    ])
    expect(rendered?.find((r) => r.kind === 'preview')?.width).toBe(PREVIEW_WIDTH)
  })

  it('keeps a page that is very narrow and very tall within the pixel budget', async () => {
    const rendered = renderPdfPages(await pdfWithPages([[2, 14400]]))
    expect(rendered).not.toBeNull()
    for (const item of rendered ?? []) {
      expect(await pixelsOf(item.bytes)).toBeLessThanOrEqual(MAX_RENDER_PIXELS)
    }
  })
})

describe('rendering images for previews', () => {
  it('refuses an image larger than the input pixel limit', async () => {
    const huge = await sharp({
      create: { width: 8000, height: 6000, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer()
    expect(await renderImage(new Uint8Array(huge))).toBeNull()
  })
})
