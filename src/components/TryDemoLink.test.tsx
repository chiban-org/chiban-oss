import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { TryDemoLink } from '@/components/TryDemoLink'
import { env } from '@/config/env'

afterEach(() => {
  env.CHIBAN_DEMO_MODE = false
})

describe('TryDemoLink', () => {
  it('links to the role picker only in demo mode', () => {
    expect(renderToStaticMarkup(<TryDemoLink />)).toBe('')
    env.CHIBAN_DEMO_MODE = true
    expect(renderToStaticMarkup(<TryDemoLink />)).toContain('href="/demo"')
  })
})
