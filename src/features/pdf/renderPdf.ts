import { PDFDocument, type PDFImage } from 'pdf-lib'
import { AppError, ErrorIds } from '@/constants/errorIds'
import {
  BLOCK_GAP,
  type BlockContext,
  drawBlock,
  LEADING,
  SIZES,
  signingSigner,
} from '@/features/pdf/pdfBlocks'
import { embedFonts } from '@/features/pdf/pdfFonts'
import {
  drawFooter,
  drawLetterhead,
  drawPlacardHeader,
  embedImage,
  type FrameArt,
} from '@/features/pdf/pdfFrame'
import {
  CONTENT_WIDTH,
  drawRule,
  drawText,
  MARGIN,
  MUTED,
  PAGE_WIDTH,
  textWidth,
} from '@/features/pdf/pdfLayout'
import { PageCursor } from '@/features/pdf/pdfPage'
import type { PdfDocumentSpec } from '@/features/pdf/pdfSpec'
import type { SignerRole } from '@/features/town/profileSchema'

export type { PdfBlock, PdfDocumentSpec } from '@/features/pdf/pdfSpec'

function drawTitle(ctx: BlockContext, spec: PdfDocumentSpec): void {
  const { layout, sizes } = ctx
  const { fonts, page } = layout
  let size = sizes.title
  while (size > 12 && textWidth(fonts.heading, spec.title, size) > CONTENT_WIDTH) size -= 2
  const width = textWidth(fonts.heading, spec.title, size)
  const x = spec.scale === 'placard' ? (PAGE_WIDTH - width) / 2 : MARGIN
  drawText(page, spec.title, { x, y: layout.y - size, font: fonts.heading, size })
  layout.y -= size * LEADING + 4
  if (spec.subtitle !== undefined) {
    drawText(page, spec.subtitle, {
      x: MARGIN,
      y: layout.y - 12,
      font: fonts.body,
      size: 12,
      color: MUTED,
    })
    layout.y -= 22
  }
  if (spec.scale === 'placard') drawRule(page, layout.y)
  layout.y -= BLOCK_GAP
}

async function embedSignatures(
  doc: PDFDocument,
  spec: PdfDocumentSpec,
): Promise<Map<SignerRole, PDFImage>> {
  const embedded = new Map<SignerRole, PDFImage>()
  for (const block of spec.blocks) {
    if (block.kind !== 'signature' || embedded.has(block.role)) continue
    const image = signingSigner(spec.frame, block)?.signature ?? null
    if (image !== null) embedded.set(block.role, await embedImage(doc, image))
  }
  return embedded
}

export async function renderPdf(spec: PdfDocumentSpec): Promise<Uint8Array> {
  if ((spec as Partial<PdfDocumentSpec>).frame === undefined) {
    throw new AppError(ErrorIds.PDF_FRAME_MISSING, 'renderPdf needs a document frame', {
      title: spec.title,
    })
  }
  const doc = await PDFDocument.create()
  const fonts = await embedFonts(doc)
  const art: FrameArt = {
    fonts,
    frame: spec.frame,
    logo: spec.frame.logo === null ? null : await embedImage(doc, spec.frame.logo),
  }
  const header = spec.scale === 'placard' ? drawPlacardHeader : drawLetterhead
  const layout = new PageCursor(doc, fonts, (page, top) => header(page, art, top))
  const ctx: BlockContext = {
    layout,
    sizes: SIZES[spec.scale],
    frame: spec.frame,
    signatures: await embedSignatures(doc, spec),
  }
  drawTitle(ctx, spec)
  for (const block of spec.blocks) drawBlock(ctx, block)
  if (spec.scale === 'document') {
    const pages = layout.all
    pages.forEach((page, index) => drawFooter(page, art, index, pages.length))
  }
  return await doc.save({ useObjectStreams: false })
}
