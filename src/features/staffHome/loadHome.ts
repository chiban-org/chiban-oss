import { loadAdminSection } from '@/features/staffHome/adminHome'
import { loadBoardSection, loadReviewerSection } from '@/features/staffHome/boardHome'
import { loadClerkSection } from '@/features/staffHome/clerkHome'
import { loadFinanceSection } from '@/features/staffHome/financeHome'
import type { HomeContext, HomeRole, HomeSection } from '@/features/staffHome/homeTypes'
import { loadInspectorSection } from '@/features/staffHome/inspectorHome'
import { loadRecordsSection } from '@/features/staffHome/recordsHome'
import { orderSections } from '@/features/staffHome/startPage'

type SectionLoader = (ctx: HomeContext) => Promise<HomeSection | null>

const LOADERS = new Map<HomeRole, SectionLoader>([
  ['admin', loadAdminSection],
  ['staff', loadClerkSection],
  ['inspector', loadInspectorSection],
  ['finance', loadFinanceSection],
  ['records_custodian', loadRecordsSection],
  ['reviewer', loadReviewerSection],
  ['board_member', loadBoardSection],
])

export async function loadHomeSections(
  ctx: HomeContext,
  roles: readonly HomeRole[],
): Promise<HomeSection[]> {
  const loaders = roles.flatMap((role) => LOADERS.get(role) ?? [])
  const loaded = await Promise.all(loaders.map((load) => load(ctx)))
  return orderSections(loaded.filter((section) => section !== null))
}
