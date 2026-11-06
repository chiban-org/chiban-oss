// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RecentParcelSearches } from '@/components/parcels/RecentParcelSearches'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('RecentParcelSearches', () => {
  it('keeps a 5000 character search inside the page by truncating its chip and titling it', async () => {
    const long = 'x'.repeat(5000)
    render(
      <RecentParcelSearches
        userId="u1"
        record={long}
        hrefBase="/staff/records/requests/r1"
        list="recentReleaseSearches"
      />,
    )
    const chip = await screen.findByRole('link', { name: long })
    expect(chip.getAttribute('title')).toBe(long)
    expect(chip.className.split(' ')).toEqual(expect.arrayContaining(['max-w-full', 'shrink']))
    expect(chip.querySelector('span')?.className).toBe('truncate')
  })
})
