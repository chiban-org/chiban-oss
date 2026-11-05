import type { Capability } from '@/constants/capabilities'
import { accessAllows } from '@/features/staffNav/access'
import type { BaseNavAccess, NavViewer } from '@/features/staffNav/navTypes'

export const SETTINGS_GROUPS = [
  { key: 'town', label: 'Town' },
  { key: 'permits', label: 'Permits' },
  { key: 'townRules', label: 'Town rules' },
  { key: 'boards', label: 'Boards' },
  { key: 'money', label: 'Money and inspections' },
  { key: 'starters', label: 'Starters' },
  { key: 'admin', label: 'Administration' },
] as const

export type SettingsGroupKey = (typeof SETTINGS_GROUPS)[number]['key']

export interface SettingsMenuItem {
  href: string
  label: string
  group: SettingsGroupKey
  access: BaseNavAccess
  match?: readonly string[]
}

export interface SettingsMenuLink {
  href: string
  label: string
  match?: readonly string[]
}

export interface SettingsMenuSection {
  key: SettingsGroupKey
  label: string
  items: SettingsMenuLink[]
}

const any = (...capabilities: Capability[]): BaseNavAccess => ({
  kind: 'anyCapability',
  capabilities,
})
const all = (...capabilities: Capability[]): BaseNavAccess => ({
  kind: 'allCapabilities',
  capabilities,
})
const config = any('config.edit')
const kind = (key: string) => `/staff/settings/${key}`

export const SETTINGS_MENU_ITEMS: readonly SettingsMenuItem[] = [
  {
    href: '/staff/settings/town-profile',
    label: 'Town profile',
    group: 'town',
    access: config,
    match: [kind('town_profile')],
  },
  { href: '/staff/settings/letterhead', label: 'Letterhead', group: 'town', access: config },
  { href: '/staff/settings/signers', label: 'Signers', group: 'town', access: config },
  {
    href: kind('application_type'),
    label: 'Application types',
    group: 'permits',
    access: config,
    match: ['/staff/settings/workflow'],
  },
  { href: kind('form'), label: 'Forms', group: 'permits', access: config },
  { href: kind('fee_schedule'), label: 'Fee schedules', group: 'permits', access: config },
  { href: kind('template'), label: 'Templates', group: 'permits', access: config },
  { href: kind('condition_library'), label: 'Conditions', group: 'permits', access: config },
  {
    href: kind('inspection_checklist'),
    label: 'Inspection checklists',
    group: 'permits',
    access: config,
  },
  {
    href: kind('town_rule_setting'),
    label: 'Town rule settings',
    group: 'townRules',
    access: config,
  },
  {
    href: kind('local_code_amendment'),
    label: 'Local code amendments',
    group: 'townRules',
    access: config,
  },
  { href: '/staff/settings/state-law', label: 'State law', group: 'townRules', access: config },
  {
    href: '/staff/settings/code-editions',
    label: 'Building code editions',
    group: 'townRules',
    access: config,
  },
  { href: kind('board_settings'), label: 'Board settings', group: 'boards', access: config },
  {
    href: kind('regional_contacts'),
    label: 'Regional notice contacts',
    group: 'boards',
    access: config,
  },
  {
    href: kind('review_routes'),
    label: 'Review committee routes',
    group: 'boards',
    access: config,
  },
  {
    href: '/staff/settings/payments',
    label: 'Card payments',
    group: 'money',
    access: config,
    match: [kind('payment_settings')],
  },
  {
    href: '/staff/settings/inspections',
    label: 'Inspection schedule',
    group: 'money',
    access: config,
    match: [kind('inspection_settings')],
  },
  {
    href: '/staff/settings/starters',
    label: 'Starter templates',
    group: 'starters',
    access: config,
  },
  {
    href: '/staff/admin/users',
    label: 'Users',
    group: 'admin',
    access: any('user.manage'),
  },
  {
    href: '/staff/admin/enforcement-officers',
    label: 'Enforcement officers',
    group: 'admin',
    access: config,
  },
  {
    href: '/staff/admin/anonymous-intake',
    label: 'Anonymous intake',
    group: 'admin',
    access: any('anonymous_intake.enable'),
  },
  {
    href: '/staff/admin/export',
    label: 'Data export',
    group: 'admin',
    access: all('config.edit', 'export.download'),
  },
  { href: '/staff/admin/health', label: 'Health', group: 'admin', access: config },
  {
    href: '/staff/admin/cutover',
    label: 'Move open applications over',
    group: 'admin',
    access: all('config.edit', 'cutover.import'),
  },
  {
    href: '/staff/admin/migration',
    label: 'Scanned property files',
    group: 'admin',
    access: all('config.edit', 'document.manage', 'parcel.manage'),
  },
]

export function settingsMenuFor(viewer: NavViewer): SettingsMenuItem[] {
  return SETTINGS_MENU_ITEMS.filter((item) => accessAllows(item.access, viewer))
}

export function groupSettingsMenu(items: readonly SettingsMenuItem[]): SettingsMenuSection[] {
  return SETTINGS_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    items: items
      .filter((item) => item.group === group.key)
      .map(({ href, label, match }) =>
        match === undefined ? { href, label } : { href, label, match },
      ),
  })).filter((section) => section.items.length > 0)
}

export function filterSettingsSections(
  sections: readonly SettingsMenuSection[],
  query: string,
): SettingsMenuSection[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...sections]
  return sections
    .map((section) =>
      section.label.toLowerCase().includes(needle)
        ? section
        : {
            ...section,
            items: section.items.filter((i) => i.label.toLowerCase().includes(needle)),
          },
    )
    .filter((section) => section.items.length > 0)
}
