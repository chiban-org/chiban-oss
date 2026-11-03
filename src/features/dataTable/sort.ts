import { firstParam, type TableParams, tableHref } from '@/features/dataTable/params'

export type SortDir = 'asc' | 'desc'

export interface SortState<K extends string> {
  key: K
  dir: SortDir
}

export interface SortConfig<K extends string> {
  defaultKey: K
  columns: Readonly<Record<K, SortDir>>
}

export interface SortLink {
  href: string
  direction: SortDir | null
}

export const SORT_PARAM = 'sort'
export const DIR_PARAM = 'dir'

function firstDirs<K extends string>(config: SortConfig<K>): ReadonlyMap<K, SortDir> {
  return new Map(Object.entries(config.columns) as [K, SortDir][])
}

function isDir(value: string | undefined): value is SortDir {
  return value === 'asc' || value === 'desc'
}

export function defaultSort<K extends string>(config: SortConfig<K>): SortState<K> {
  return { key: config.defaultKey, dir: firstDirs(config).get(config.defaultKey) ?? 'asc' }
}

export function parseSort<K extends string>(
  config: SortConfig<K>,
  params: TableParams,
): SortState<K> {
  const key = firstParam(params, SORT_PARAM)
  const first = firstDirs(config).get(key as K)
  if (key === undefined || first === undefined) return defaultSort(config)
  const dir = firstParam(params, DIR_PARAM)
  return { key: key as K, dir: isDir(dir) ? dir : first }
}

function isDefault<K extends string>(config: SortConfig<K>, state: SortState<K>): boolean {
  const fallback = defaultSort(config)
  return state.key === fallback.key && state.dir === fallback.dir
}

export function sortHref<K extends string>(
  path: string,
  params: TableParams,
  config: SortConfig<K>,
  state: SortState<K>,
): string {
  const patch = isDefault(config, state)
    ? { [SORT_PARAM]: null, [DIR_PARAM]: null }
    : { [SORT_PARAM]: state.key, [DIR_PARAM]: state.dir }
  return tableHref(path, params, patch)
}

function flip(dir: SortDir): SortDir {
  return dir === 'asc' ? 'desc' : 'asc'
}

export function sortLinks<K extends string>(
  path: string,
  params: TableParams,
  config: SortConfig<K>,
  current: SortState<K>,
): Record<K, SortLink> {
  const entries = [...firstDirs(config)].map(([key, first]): [K, SortLink] => {
    const active = key === current.key
    const next = { key, dir: active ? flip(current.dir) : first }
    return [
      key,
      { href: sortHref(path, params, config, next), direction: active ? current.dir : null },
    ]
  })
  return Object.fromEntries(entries) as Record<K, SortLink>
}
