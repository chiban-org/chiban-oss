import { EXPORT_FORMAT_PAGE_PATH, renderFormatDocPage } from '@/features/export/formatDocPage'
import { CONFIG_REFERENCE_PATH, renderConfigReference } from './configReference'
import {
  MENUS_LIST_PATH,
  PERMISSIONS_TABLE_PATH,
  renderMenusList,
  renderPermissionsTable,
} from './rolesReference'
import { renderStarterCatalog, starterCatalogPath } from './starterCatalog'
import {
  clocksPath,
  holidaysPath,
  otherRulesPath,
  renderClocks,
  renderHolidays,
  renderOtherRules,
} from './stateDeadlines'

export interface GeneratedPage {
  path: string
  render: () => string
}

export function generatedPages(): readonly GeneratedPage[] {
  return [
    { path: CONFIG_REFERENCE_PATH, render: renderConfigReference },
    { path: PERMISSIONS_TABLE_PATH, render: renderPermissionsTable },
    { path: MENUS_LIST_PATH, render: renderMenusList },
    { path: starterCatalogPath(), render: renderStarterCatalog },
    { path: clocksPath(), render: renderClocks },
    { path: holidaysPath(), render: renderHolidays },
    { path: otherRulesPath(), render: renderOtherRules },
    { path: EXPORT_FORMAT_PAGE_PATH, render: renderFormatDocPage },
  ]
}
