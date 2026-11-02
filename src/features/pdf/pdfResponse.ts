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

const MESSAGES = {
  403: 'You do not have permission to open this.',
  404: 'That page was not found.',
} as const

function wantsHtml(accept: string | null): boolean {
  return accept?.includes('text/html') === true
}

function htmlPage(status: 403 | 404): string {
  const heading = status === 403 ? 'Not allowed' : 'Not found'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${heading}</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;font-size:1rem"><h1>${heading}</h1><p>${MESSAGES[status]}</p><p><a href="/" style="display:inline-block;min-height:44px;line-height:44px">Back to the home page</a></p></body></html>`
}

export function toResponse(data: PdfResponseData, accept: string | null = null): Response {
  const headers = {
    'content-disposition': 'inline',
    'cache-control': 'private, no-store',
  }
  if (data.status !== 200 && wantsHtml(accept)) {
    return new Response(htmlPage(data.status), {
      status: data.status,
      headers: { ...headers, 'content-type': 'text/html; charset=utf-8' },
    })
  }
  return new Response(data.body as BodyInit, {
    status: data.status,
    headers: { ...headers, 'content-type': data.contentType },
  })
}
