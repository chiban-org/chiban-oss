export type RawSearchParams = Record<string, string | string[] | undefined>

export type TableParams = ReadonlyMap<string, readonly string[]>

export type ParamsPatch = Readonly<Record<string, string | readonly string[] | null>>

export const PAGE_PARAM = 'cursor'

export function readTableParams(raw: RawSearchParams): TableParams {
  const params = new Map<string, string[]>()
  for (const [name, value] of Object.entries(raw)) {
    const values = (Array.isArray(value) ? value : [value ?? '']).filter((v) => v !== '')
    if (values.length > 0) params.set(name, values)
  }
  return params
}

export function paramValues(params: TableParams, name: string): readonly string[] {
  return params.get(name) ?? []
}

export function firstParam(params: TableParams, name: string): string | undefined {
  return params.get(name)?.[0]
}

function asList(value: string | readonly string[] | null): readonly string[] {
  if (value === null) return []
  return typeof value === 'string' ? [value] : value
}

export function tableHref(path: string, params: TableParams, patch: ParamsPatch = {}): string {
  const merged = new Map(params)
  merged.delete(PAGE_PARAM)
  for (const [name, value] of Object.entries(patch)) merged.set(name, asList(value))
  const query = new URLSearchParams()
  for (const [name, values] of merged) {
    for (const value of values) if (value !== '') query.append(name, value)
  }
  const text = query.toString()
  return text === '' ? path : `${path}?${text}`
}

export function pageHref(path: string, params: TableParams, cursor: string | null): string {
  return tableHref(path, params, { [PAGE_PARAM]: cursor === '0' ? null : cursor })
}

export function readOffset(params: TableParams): number {
  const raw = firstParam(params, PAGE_PARAM)
  if (raw === undefined || !/^\d+$/.test(raw)) return 0
  const offset = Number(raw)
  return Number.isSafeInteger(offset) ? offset : 0
}

export function clearHref(
  path: string,
  params: TableParams,
  names: readonly string[],
): string | null {
  if (!names.some((name) => params.has(name))) return null
  return tableHref(path, params, Object.fromEntries(names.map((name) => [name, null])))
}
