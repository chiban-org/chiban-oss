import { loadAdminSection } from '@/features/staffHome/adminHome'
import { loadBoardSection, loadReviewerSection } from '@/features/staffHome/boardHome'
import { loadClerkSection } from '@/features/staffHome/clerkHome'
import { loadEnforcementSection } from '@/features/staffHome/enforcementHome'
import { loadFinanceSection } from '@/features/staffHome/financeHome'
import type { HomeContext, HomeRole, HomeSection } from '@/features/staffHome/homeTypes'
import { loadInspectorSection } from '@/features/staffHome/inspectorHome'
import { loadPacketsSection } from '@/features/staffHome/packetsHome'
import { loadRecordsSection } from '@/features/staffHome/recordsHome'
import { orderSections } from '@/features/staffHome/startPage'

type SectionLoader = (ctx: HomeContext) => Promise<HomeSection | null>

const ROLE_LOADERS = new Map<HomeRole, SectionLoader>([
  ['admin', loadAdminSection],
  ['staff', loadClerkSection],
  ['reviewer', loadReviewerSection],
  ['board_member', loadBoardSection],
])

const CAPABILITY_LOADERS: readonly SectionLoader[] = [
  loadInspectorSection,
  loadFinanceSection,
  loadRecordsSection,
  loadEnforcementSection,
  loadPacketsSection,
]

export async function loadHomeSections(
  ctx: HomeContext,
  roles: readonly HomeRole[],
): Promise<HomeSection[]> {
  const loaders = [...roles.flatMap((role) => ROLE_LOADERS.get(role) ?? []), ...CAPABILITY_LOADERS]
  const loaded = await Promise.all(loaders.map((load) => load(ctx)))
  return orderSections(loaded.filter((section) => section !== null))
}
