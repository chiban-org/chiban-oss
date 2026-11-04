import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PracticeNotice } from '@/components/PracticeNotice'

describe('PracticeNotice', () => {
  it('renders a note on a plain surface, never a highlighter wash', () => {
    const html = renderToStaticMarkup(
      <PracticeNotice>Not connected to a live processor.</PracticeNotice>,
    )
    expect(html).toMatch(/^<p role="note"[^>]*>Not connected to a live processor\.<\/p>$/)
    expect(html).toContain('border-dashed')
    expect(html).not.toContain('bg-highlight')
  })
})
