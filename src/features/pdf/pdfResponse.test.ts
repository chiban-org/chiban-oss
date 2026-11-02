import { describe, expect, it } from 'vitest'
import { FORBIDDEN, NOT_FOUND, pdfOk, toResponse } from '@/features/pdf/pdfResponse'

const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

describe('toResponse', () => {
  it('sends a browser navigation an HTML 403 page, not JSON', async () => {
    const res = toResponse(FORBIDDEN, BROWSER_ACCEPT)
    expect(res.status).toBe(403)
    expect(res.headers.get('content-type')).toContain('text/html')
    const body = await res.text()
    expect(body).toContain('You do not have permission')
    expect(body).not.toContain('"error"')
  })

  it('sends a browser navigation an HTML 404 page', () => {
    const res = toResponse(NOT_FOUND, BROWSER_ACCEPT)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('keeps JSON for API clients', async () => {
    const res = toResponse(FORBIDDEN, 'application/json')
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ error: 'forbidden' })
    expect(toResponse(FORBIDDEN, null).headers.get('content-type')).toContain('application/json')
  })

  it('never rewrites a successful PDF', () => {
    const res = toResponse(pdfOk(new Uint8Array([1])), BROWSER_ACCEPT)
    expect(res.headers.get('content-type')).toBe('application/pdf')
  })
})
