import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { KindPicker } from '@/components/config/letterBuilder/KindPicker'
import { PackTextProvider } from '@/components/PackTextProvider'
import { packText } from '@/features/packs/packText'
import { withPackForTest } from '@/features/packs/registry'
import { XX_PACK } from '@/test/packs/xx'

const picker = <KindPicker value="rtk_response" locked={false} onChange={() => undefined} />

function render(words: ReturnType<typeof packText>): string {
  return renderToStaticMarkup(<PackTextProvider value={words}>{picker}</PackTextProvider>)
}

describe('client screens read the pack vocabulary through the provider', () => {
  it('shows the words the provider was given while the New Hampshire pack is active', () => {
    const words = withPackForTest(XX_PACK, () => packText())
    const html = render(words)
    expect(html).toContain('>Open Records response<')
    expect(html).not.toContain('Right-to-Know')
  })

  it('shows the New Hampshire words with the New Hampshire pack', () => {
    expect(render(packText())).toContain('>Right-to-Know response<')
  })

  it('falls back to plain words with no state law name outside a provider', () => {
    const html = renderToStaticMarkup(picker)
    expect(html).toContain('>Public Records response<')
    expect(html).not.toContain('Right-to-Know')
    expect(html).not.toContain('Open Records')
  })
})
