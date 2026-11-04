import type { PDFDocument, PDFPage } from 'pdf-lib'
import type { Fonts } from '@/features/pdf/pdfFonts'
import { FOOTER_RESERVE, MARGIN, PAGE_HEIGHT, PAGE_WIDTH } from '@/features/pdf/pdfLayout'

export class PageCursor {
  private readonly pages: PDFPage[] = []
  private current: PDFPage
  y = 0

  constructor(
    private readonly doc: PDFDocument,
    readonly fonts: Fonts,
    private readonly startPage: (page: PDFPage, top: number) => number,
  ) {
    this.current = this.addPage()
  }

  private addPage(): PDFPage {
    const page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.pages.push(page)
    this.current = page
    this.y = this.startPage(page, PAGE_HEIGHT - MARGIN)
    return page
  }

  get page(): PDFPage {
    return this.current
  }

  get all(): PDFPage[] {
    return this.pages
  }

  ensure(height: number, onNewPage?: () => void): void {
    if (this.y - height >= MARGIN + FOOTER_RESERVE) return
    this.addPage()
    onNewPage?.()
  }
}
