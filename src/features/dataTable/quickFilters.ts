import { paramValues, type TableParams, tableHref } from '@/features/dataTable/params'

export interface FilterOption {
  value: string
  label: string
  count?: number
}

export type GroupDisplay = 'inline' | 'menu'

export const INLINE_GROUP_MAX = 3

export interface FilterGroup {
  param: string
  label: string
  options: readonly FilterOption[]
  display?: GroupDisplay
  single?: boolean
}

export interface ChipView {
  label: string
  href: string
  active: boolean
  count?: number
}

export interface ChipGroupView {
  label: string
  display: GroupDisplay
  chips: ChipView[]
}

function displayOf(group: FilterGroup): GroupDisplay {
  return group.display ?? (group.options.length <= INLINE_GROUP_MAX ? 'inline' : 'menu')
}

export function filterValues<V extends string>(
  params: TableParams,
  param: string,
  allowed: readonly V[] | ((value: string) => boolean),
): V[] {
  const accepts =
    typeof allowed === 'function'
      ? allowed
      : (value: string) => (allowed as readonly string[]).includes(value)
  return [...new Set(paramValues(params, param).filter(accepts))] as V[]
}

export function singleValue<V extends string>(
  params: TableParams,
  param: string,
  allowed: readonly V[],
): V[] {
  return filterValues(params, param, allowed).slice(0, 1)
}

export function labeledOptions(
  labels: ReadonlyMap<string, string>,
  counts?: ReadonlyMap<string, number>,
): FilterOption[] {
  return [...labels].map(([value, label]) => {
    const count = counts?.get(value)
    return count === undefined ? { value, label } : { value, label, count }
  })
}

export function whenAny<K extends string, V>(key: K, values: V[]): Partial<Record<K, V[]>> {
  return values.length === 0 ? {} : ({ [key]: values } as Partial<Record<K, V[]>>)
}

function toggled(values: readonly string[], value: string, single: boolean): string[] {
  if (values.includes(value)) return values.filter((v) => v !== value)
  return single ? [value] : [...values, value]
}

function withActiveExtras(group: FilterGroup, active: readonly string[]): FilterOption[] {
  const offered = new Set(group.options.map((o) => o.value))
  const extras = active.filter((v) => !offered.has(v)).map((value) => ({ value, label: value }))
  return [...group.options, ...extras]
}

export function chipGroups(
  path: string,
  params: TableParams,
  groups: readonly FilterGroup[],
): ChipGroupView[] {
  return groups.map((group) => {
    const given = paramValues(params, group.param)
    const single = group.single === true
    const active = single ? given.slice(0, 1) : given
    return {
      label: group.label,
      display: displayOf(group),
      chips: withActiveExtras(group, active).map((option) => ({
        label: option.label,
        href: tableHref(path, params, { [group.param]: toggled(active, option.value, single) }),
        active: active.includes(option.value),
        ...(option.count === undefined ? {} : { count: option.count }),
      })),
    }
  })
}

function totalOf(options: readonly FilterOption[]): number | undefined {
  let total = 0
  for (const option of options) {
    if (option.count === undefined) return undefined
    total += option.count
  }
  return total
}

export function filterTabs(
  path: string,
  params: TableParams,
  group: FilterGroup,
  allLabel = 'All',
): ChipView[] {
  const chosen = paramValues(params, group.param)[0]
  const active = group.options.some((o) => o.value === chosen) ? chosen : undefined
  const total = totalOf(group.options)
  const all: ChipView = {
    label: allLabel,
    href: tableHref(path, params, { [group.param]: null }),
    active: active === undefined,
    ...(total === undefined ? {} : { count: total }),
  }
  return [
    all,
    ...group.options.map((option) => ({
      label: option.label,
      href: tableHref(path, params, { [group.param]: [option.value] }),
      active: option.value === active,
      ...(option.count === undefined ? {} : { count: option.count }),
    })),
  ]
}
