import type { TableParams } from '@/features/dataTable/params'
import {
  DIR_PARAM,
  SORT_PARAM,
  type SortConfig,
  type SortLink,
  type SortState,
  parseSort,
  sortLinks,
} from '@/features/dataTable/sort'

const BASE_NAMES = [SORT_PARAM, DIR_PARAM] as const

function scopedName(scope: string, name: string): string {
  return `${scope}_${name}`
}

function asBaseParams(params: TableParams, scope: string): TableParams {
  const out = new Map(params)
  for (const name of BASE_NAMES) {
    out.delete(name)
    const scoped = scopedName(scope, name)
    const values = params.get(scoped)
    out.delete(scoped)
    if (values !== undefined) out.set(name, values)
  }
  return out
}

function toScopedHref(href: string, scope: string): string {
  const split = href.indexOf('?')
  if (split < 0) return href
  const query = new URLSearchParams()
  for (const [name, value] of new URLSearchParams(href.slice(split + 1))) {
    query.append(
      (BASE_NAMES as readonly string[]).includes(name) ? scopedName(scope, name) : name,
      value,
    )
  }
  const text = query.toString()
  return text === '' ? href.slice(0, split) : `${href.slice(0, split)}?${text}`
}

export function scopedSort<K extends string>(
  path: string,
  params: TableParams,
  config: SortConfig<K>,
  scope: string,
): { state: SortState<K>; links: Record<K, SortLink> } {
  const base = asBaseParams(params, scope)
  const state = parseSort(config, base)
  const links = sortLinks(path, base, config, state)
  const scoped = Object.fromEntries(
    Object.entries<SortLink>(links).map(([key, link]) => [
      key,
      { ...link, href: toScopedHref(link.href, scope) },
    ]),
  ) as Record<K, SortLink>
  return { state, links: scoped }
}

export function activeSortFields(
  params: TableParams,
  scopes: readonly string[],
): [string, string][] {
  return scopes.flatMap((scope) =>
    BASE_NAMES.flatMap((name): [string, string][] => {
      const scoped = scopedName(scope, name)
      const value = params.get(scoped)?.[0]
      return value === undefined ? [] : [[scoped, value]]
    }),
  )
}
