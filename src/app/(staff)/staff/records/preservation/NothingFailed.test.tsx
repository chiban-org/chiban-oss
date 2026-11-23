import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NothingFailed } from './NothingFailed'

describe('the preservation queue with nothing to fix', () => {
  it('says no archival copy has failed when nothing waits to be tried again', () => {
    const html = renderToStaticMarkup(<NothingFailed waiting={0} retrying={0} />)
    expect(html).toContain('No archival copy has failed.')
  })

  it('does not say nothing failed while failed copies wait to be tried again', () => {
    const html = renderToStaticMarkup(<NothingFailed waiting={0} retrying={2} />)
    expect(html).not.toContain('No archival copy has failed.')
    expect(html).toContain('Nothing needs fixing right now.')
  })

  it('keeps the note on documents waiting for their first copy', () => {
    const html = renderToStaticMarkup(<NothingFailed waiting={1} retrying={0} />)
    expect(html).toContain('1 document is waiting for its first archival copy.')
  })
})
