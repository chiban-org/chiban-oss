import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { DemoBanner } from '@/components/DemoBanner'
import { env } from '@/config/env'

const original = { demo: env.CHIBAN_DEMO_MODE, resetAt: env.CHIBAN_DEMO_RESET_AT }

afterEach(() => {
  env.CHIBAN_DEMO_MODE = original.demo
  env.CHIBAN_DEMO_RESET_AT = original.resetAt
})

describe('DemoBanner', () => {
  it('renders nothing when demo mode is off', () => {
    env.CHIBAN_DEMO_MODE = false
    expect(renderToStaticMarkup(<DemoBanner />)).toBe('')
  })

  it('says it is a demo, when it resets and that mail is not delivered', () => {
    env.CHIBAN_DEMO_MODE = true
    env.CHIBAN_DEMO_RESET_AT = '3:00 AM Eastern'
    const html = renderToStaticMarkup(<DemoBanner />)
    expect(html).toContain('role="note"')
    expect(html).toContain(
      'This is a demo. The data resets every night at 3:00 AM Eastern, and mail is not delivered.',
    )
  })
})
