import { CAPABILITIES, CAPABILITY_KEYS } from '@/constants/capabilities'
import { type Role, STAFF_ROLES } from '@/constants/roles'
import { DEFAULT_GRANTS } from '@/features/authz/defaultGrants'
import { settingsMenuFor } from '@/features/settingsMenu/settingsMenu'
import { type NavViewer, navItemsFor } from '@/features/staffNav/navItems'
import { roleLabel } from '@/features/staffNav/roleLabels'
import { generatedFrontMatter } from '@/lib/generatedFrontMatter'
import { joinBlocks, listInWords, table } from './markdown'

export const PERMISSIONS_TABLE_PATH = 'docs-site/docs/reference/_generated/permissions.md'
export const MENUS_LIST_PATH = 'docs-site/docs/reference/_generated/menus.md'

const SOURCES = [
  'src/constants/roles.ts',
  'src/constants/capabilities.ts',
  'src/features/authz/defaultGrants.ts',
  'src/features/staffNav/roleLabels.ts',
  'src/features/staffNav/navEntries.ts',
  'src/features/staffNav/navItems.ts',
  'src/features/settingsMenu/settingsMenu.ts',
]

function viewerFor(role: Role): NavViewer {
  return { roles: [role], capabilities: new Set(DEFAULT_GRANTS[role] ?? []) }
}

function sentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`
}

export function renderPermissionsTable(): string {
  const rows = CAPABILITY_KEYS.map((capability) => {
    const holders = STAFF_ROLES.filter((role) => DEFAULT_GRANTS[role]?.includes(capability))
    const who = holders.length === 0 ? 'None' : listInWords(holders.map(roleLabel))
    return [sentence(CAPABILITIES[capability]), who]
  })
  return `${generatedFrontMatter({ sources: SOURCES })}${joinBlocks([
    table(['Permission', 'Roles that have it'], rows),
  ])}`
}

export function renderMenusList(): string {
  const entries = STAFF_ROLES.map((role) => {
    const viewer = viewerFor(role)
    const menu = navItemsFor(viewer)
      .filter((item) => item.access.kind !== 'settings')
      .map((item) => item.label)
    const settings = settingsMenuFor(viewer).map((item) => item.label)
    const settingsText = settings.length === 0 ? 'none' : settings.join(', ')
    return `- **${roleLabel(role)}.** Staff menu: ${menu.join(', ')}. Settings: ${settingsText}.`
  })
  return `${generatedFrontMatter({ sources: SOURCES })}${joinBlocks([entries.join('\n')])}`
}
