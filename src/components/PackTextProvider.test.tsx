import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { KindPicker } from '@/components/config/letterBuilder/KindPicker'
import { PackTextProvider } from '@/components/PackTextProvider'
import { packText } from '@/features/packs/packText'
import { withPackForTest } from '@/features/packs/registry'
import { XX_PACK } from '@/test/packs/xx'

function render(words: ReturnType<typeof packText>): string {
  return renderToStaticMarkup(
    <PackTextProvider value={words}>
      <KindPicker value="rtk_response" locked={false} onChange={() => undefined} />
    </PackTextProvider>,
  )
}

describe('client screens read the pack vocabulary through the provider', () => {
  it('shows the fictional pack words and none of the New Hampshire ones', () => {
    const html = withPackForTest(XX_PACK, () => render(packText()))
    expect(html).toContain('>Open Records response<')
    expect(html).not.toContain('Right-to-Know')
  })

  it('shows the New Hampshire words with the New Hampshire pack', () => {
    expect(render(packText())).toContain('>Right-to-Know response<')
  })
})
