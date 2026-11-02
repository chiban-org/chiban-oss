export interface PdfResponseData {
  status: 200 | 403 | 404
  contentType: 'application/pdf' | 'application/json'
  body: Uint8Array | string
}

export const FORBIDDEN: PdfResponseData = {
  status: 403,
  contentType: 'application/json',
  body: JSON.stringify({ error: 'forbidden' }),
}

export const NOT_FOUND: PdfResponseData = {
  status: 404,
  contentType: 'application/json',
  body: JSON.stringify({ error: 'not_found' }),
}

export function pdfOk(bytes: Uint8Array): PdfResponseData {
  return { status: 200, contentType: 'application/pdf', body: bytes }
}

export function toResponse(data: PdfResponseData): Response {
  return new Response(data.body as BodyInit, {
    status: data.status,
    headers: {
      'content-type': data.contentType,
      'content-disposition': 'inline',
      'cache-control': 'private, no-store',
    },
  })
}
