import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ServiceNotice } from '@/components/ServiceNotice'
import type { CivilDate } from '@/types/civilDate'

describe('ServiceNotice', () => {
  it('renders nothing while the service is active', () => {
    expect(renderToStaticMarkup(<ServiceNotice mode="active" exportUntil={null} />)).toBe('')
  })

  it('names the last export day in long form during the window', () => {
    const html = renderToStaticMarkup(
      <ServiceNotice mode="export_only" exportUntil={'2027-12-29' as CivilDate} />,
    )
    expect(html).toContain(
      'This service is no longer active. Records can be exported from the admin page until December 29, 2027.',
    )
  })

  it('says the service is closed after the window', () => {
    const html = renderToStaticMarkup(<ServiceNotice mode="closed" exportUntil={null} />)
    expect(html).toContain('This service is closed.')
  })
})
