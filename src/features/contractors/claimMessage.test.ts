import { describe, expect, it } from 'vitest'
import { claimMessage } from '@/features/contractors/claimMessage'

describe('claimMessage', () => {
  it('names the town it is given and escapes names in the HTML', () => {
    const message = claimMessage({
      to: 'sam@example.com',
      name: 'Sam <Lee>',
      role: 'contractor',
      title: 'Garage addition',
      link: 'https://town.example/claim/abc',
      days: 14,
      townName: 'Town of Birch Hollow',
      wording: {},
    })
    expect(message.text).toContain('at the Town of Birch Hollow.')
    expect(message.text).not.toContain('Alder Pond')
    expect(message.html).toContain('Sam &lt;Lee&gt;')
  })
})
