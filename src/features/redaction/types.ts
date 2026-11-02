export interface PdfBox {
  page: number
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface ImageBox {
  x: number
  y: number
  width: number
  height: number
}

export interface RedactionResult {
  bytes: Uint8Array
  removedText: string[]
}

export type PdfRedactionFailure = {
  reason: 'unreadable' | 'encrypted' | 'box_out_of_bounds' | 'verification_failed'
  detail: string
}
