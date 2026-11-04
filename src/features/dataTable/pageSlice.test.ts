import { describe, expect, it } from 'vitest'
import { pagerLinks, pageWindow, slicePage } from '@/features/dataTable/pageSlice'
import { readTableParams } from '@/features/dataTable/params'

const rows = Array.from({ length: 60 }, (_, i) => i)

describe('slicePage', () => {
  it('shows the first 25 rows and links to the next page', () => {
    const page = slicePage(rows, 0, 25)
    expect(page.rows).toHaveLength(25)
    expect(page).toMatchObject({ offset: 0, total: 60, prevOffset: null, nextOffset: 25 })
  })

  it('ends on a short last page with no next link', () => {
    const page = slicePage(rows, 50, 25)
    expect(page.rows).toEqual([50, 51, 52, 53, 54, 55, 56, 57, 58, 59])
    expect(page).toMatchObject({ prevOffset: 25, nextOffset: null })
  })

  it('falls back to the last page when the offset runs past the end', () => {
    expect(slicePage(rows, 500, 25)).toMatchObject({ offset: 50, prevOffset: 25 })
  })

  it('shows no pages for a list that fits on one', () => {
    expect(pageWindow(0, 25, 3)).toEqual({
      offset: 0,
      total: 3,
      prevOffset: null,
      nextOffset: null,
    })
  })
})

describe('pagerLinks', () => {
  it('keeps the filters and sort in the page links', () => {
    const params = readTableParams({ status: 'applied', sort: 'reason' })
    const links = pagerLinks('/staff/overrides/aliases', params, slicePage(rows, 25, 25))
    expect(links.prevHref).toBe('/staff/overrides/aliases?status=applied&sort=reason')
    expect(links.nextHref).toBe('/staff/overrides/aliases?status=applied&sort=reason&cursor=50')
    expect(links).toMatchObject({ offset: 25, shown: 25, total: 60 })
  })
})
