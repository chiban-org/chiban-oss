import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { proxy } from '@/proxy'

function get(path: string, cookie?: string): NextRequest {
  return new NextRequest(`https://alderpond.example${path}`, {
    headers: cookie === undefined ? {} : { cookie },
  })
}

function forwardedCookie(res: Response): string | null {
  return res.headers.get('x-middleware-request-cookie')
}

describe('proxy', () => {
  it('mints a cookie and forwards it on first GET', () => {
    const res = proxy(get('/parcels'))
    const setCookie = res.headers.get('set-cookie') ?? ''
    const match = /chiban_csrf=([^;]+)/.exec(setCookie)
    expect(match).not.toBeNull()
    expect(forwardedCookie(res)).toContain(`chiban_csrf=${match?.[1]}`)
  })

  it('leaves a request with the cookie untouched', () => {
    const res = proxy(get('/parcels', 'chiban_csrf=abc'))
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('skips tile requests', () => {
    const res = proxy(get('/api/tiles/parcels/16/1/1'))
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('does not mint on POST', () => {
    const req = new NextRequest('https://alderpond.example/parcels', { method: 'POST' })
    expect(proxy(req).headers.get('set-cookie')).toBeNull()
  })
})
