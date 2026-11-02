import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CsrfField } from '@/components/CsrfField'
import { CsrfProvider } from '@/components/CsrfProvider'

describe('CsrfField', () => {
  it('renders the token in server HTML', () => {
    const html = renderToString(
      <CsrfProvider token="t1">
        <CsrfField />
      </CsrfProvider>,
    )
    expect(html).toContain('value="t1"')
  })
})
