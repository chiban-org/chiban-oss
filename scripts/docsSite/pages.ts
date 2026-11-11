import { EXPORT_FORMAT_PAGE_PATH, renderFormatDocPage } from '@/features/export/formatDocPage'
import { CONFIG_REFERENCE_PATH, renderConfigReference } from './configReference'
import {
  CLOCKS_PATH,
  HOLIDAYS_PATH,
  OTHER_RULES_PATH,
  renderClocks,
  renderHolidays,
  renderOtherRules,
} from './nhDeadlines'
import {
  MENUS_LIST_PATH,
  PERMISSIONS_TABLE_PATH,
  renderMenusList,
  renderPermissionsTable,
} from './rolesReference'
import { renderStarterCatalog, STARTER_CATALOG_PATH } from './starterCatalog'

export interface GeneratedPage {
  path: string
  render: () => string
}

export const GENERATED_PAGES: readonly GeneratedPage[] = [
  { path: CONFIG_REFERENCE_PATH, render: renderConfigReference },
  { path: PERMISSIONS_TABLE_PATH, render: renderPermissionsTable },
  { path: MENUS_LIST_PATH, render: renderMenusList },
  { path: STARTER_CATALOG_PATH, render: renderStarterCatalog },
  { path: CLOCKS_PATH, render: renderClocks },
  { path: HOLIDAYS_PATH, render: renderHolidays },
  { path: OTHER_RULES_PATH, render: renderOtherRules },
  { path: EXPORT_FORMAT_PAGE_PATH, render: renderFormatDocPage },
]
