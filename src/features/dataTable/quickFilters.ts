import { paramValues, type TableParams, tableHref } from '@/features/dataTable/params'

export interface FilterOption {
  value: string
  label: string
  count?: number
}

export interface FilterGroup {
  param: string
  label: string
  options: readonly FilterOption[]
}

export interface ChipView {
  label: string
  href: string
  active: boolean
  count?: number
}

export interface ChipGroupView {
  label: string
  chips: ChipView[]
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

function toggled(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
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
    const active = paramValues(params, group.param)
    return {
      label: group.label,
      chips: withActiveExtras(group, active).map((option) => ({
        label: option.label,
        href: tableHref(path, params, { [group.param]: toggled(active, option.value) }),
        active: active.includes(option.value),
        ...(option.count === undefined ? {} : { count: option.count }),
      })),
    }
  })
}
