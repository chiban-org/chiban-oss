import { KIND_LABELS } from '@/features/config/kindLabels'
import type { HomeContext, HomeRow, HomeSection } from '@/features/staffHome/homeTypes'
import {
  draftsByKind,
  exportsFailedSinceLastGood,
  healthProblems,
  layersNeedingImport,
  openImportExceptions,
  staffStatusCounts,
} from '@/features/staffHome/systemCounts'
import { mayOpen } from '@/features/staffNav/navItems'

const HEALTH = '/staff/admin/health'
const USERS = '/staff/admin/users'
const IMPORTS = '/staff/gis/imports'

async function when(allowed: boolean, load: () => Promise<HomeRow[]>): Promise<HomeRow[]> {
  return allowed ? await load() : []
}

async function userRows(ctx: HomeContext): Promise<HomeRow[]> {
  const counts = await staffStatusCounts(ctx.db, ctx.signal)
  return [
    {
      label: 'Invitations not yet accepted',
      count: counts.get('invited') ?? 0,
      href: `${USERS}?tab=invited`,
    },
    {
      label: 'Disabled accounts',
      count: counts.get('disabled') ?? 0,
      href: `${USERS}?tab=disabled`,
    },
  ]
}

async function draftRows(ctx: HomeContext): Promise<HomeRow[]> {
  const drafts = await draftsByKind(ctx.db, ctx.signal)
  return drafts.map((d) => ({
    label: `${KIND_LABELS[d.kind]}: drafts not yet published`,
    count: d.count,
    href: `/staff/settings/${d.kind}`,
  }))
}

async function importRows(ctx: HomeContext, now: Date): Promise<HomeRow[]> {
  const [layers, exceptions] = await Promise.all([
    layersNeedingImport(ctx.db, now, ctx.signal),
    openImportExceptions(ctx.db, ctx.signal),
  ])
  return [
    { label: 'Map layers with a failed or out of date import', count: layers, href: IMPORTS },
    {
      label: 'Import exceptions to review',
      count: exceptions,
      href: '/staff/gis/exceptions?status=open',
    },
  ]
}

export async function loadAdminSection(ctx: HomeContext): Promise<HomeSection | null> {
  const now = new Date()
  const [health, users, drafts, imports, exports] = await Promise.all([
    when(mayOpen(HEALTH, ctx.viewer), async () => [
      {
        label: 'Health checks needing attention',
        count: await healthProblems(ctx.db, now, ctx.signal),
        href: HEALTH,
      },
    ]),
    when(mayOpen(USERS, ctx.viewer), () => userRows(ctx)),
    when(ctx.viewer.capabilities.has('config.edit'), () => draftRows(ctx)),
    when(mayOpen(IMPORTS, ctx.viewer), () => importRows(ctx, now)),
    when(mayOpen('/staff/admin/export', ctx.viewer), async () => [
      {
        label: 'Exports that failed since the last good one',
        count: await exportsFailedSinceLastGood(ctx.db, ctx.signal),
        href: '/staff/admin/export',
      },
    ]),
  ])
  const rows = [...health, ...users, ...drafts, ...imports, ...exports]
  if (rows.length === 0) return null
  return {
    role: 'admin',
    title: 'System',
    urgency: health[0]?.count ?? 0,
    rows,
    links: mayOpen(HEALTH, ctx.viewer) ? [{ label: 'Open Health', href: HEALTH }] : [],
    detail: null,
  }
}
