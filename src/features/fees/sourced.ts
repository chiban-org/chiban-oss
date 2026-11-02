export type SourcedKind = 'pack_rule' | 'town_setting' | 'manual_override'

export interface Sourced<T> {
  value: T
  source: SourcedKind
  replaced: { value: T; source: 'pack_rule' | 'town_setting' } | null
}
