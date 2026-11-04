import { pageHref, type TableParams } from '@/features/dataTable/params'

export interface PageWindow {
  offset: number
  total: number
  prevOffset: number | null
  nextOffset: number | null
}

export function pageWindow(offset: number, limit: number, total: number): PageWindow {
  return {
    offset,
    total,
    prevOffset: offset === 0 ? null : Math.max(0, offset - limit),
    nextOffset: offset + limit < total ? offset + limit : null,
  }
}

export function slicePage<T>(
  rows: readonly T[],
  offset: number,
  limit: number,
): PageWindow & { rows: T[] } {
  const lastPage = rows.length === 0 ? 0 : Math.floor((rows.length - 1) / limit) * limit
  const window = pageWindow(Math.min(offset, lastPage), limit, rows.length)
  return { ...window, rows: rows.slice(window.offset, window.offset + limit) }
}

export function pagerLinks(
  path: string,
  params: TableParams,
  page: PageWindow & { rows: readonly unknown[] },
) {
  const link = (offset: number | null) =>
    offset === null ? null : pageHref(path, params, String(offset))
  return {
    offset: page.offset,
    shown: page.rows.length,
    total: page.total,
    prevHref: link(page.prevOffset),
    nextHref: link(page.nextOffset),
  }
}
