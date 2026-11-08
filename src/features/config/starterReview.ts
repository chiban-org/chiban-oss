import { NH_STARTERS } from '@packs/nh/starters'
import { isNotNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { configVersions } from '@/db/schema'
import { membersInOrder } from '@/features/config/adoptStarter'
import type { ConfigKind } from '@/features/config/kinds'
import { type DiffEntry, starterDiff } from '@/features/config/starterDiff'
import { getPublished } from '@/features/config/store'

export interface ReviewBundle {
  starterId: string
  label: string
  upstreamVersion: number
  members: { kind: ConfigKind; key: string; label: string; entries: DiffEntry[] }[]
}

function memberLabel(body: unknown, starterLabel: string): string {
  const label = (body as { label?: unknown }).label
  return typeof label === 'string' && label !== '' ? label : starterLabel
}

export async function loadStarterReviews(db: DbOrTx, signal: AbortSignal): Promise<ReviewBundle[]> {
  signal.throwIfAborted()
  const bundles: ReviewBundle[] = []
  const rows = await db
    .select({
      kind: configVersions.kind,
      key: configVersions.key,
      starterId: configVersions.upstreamTemplateId,
      version: configVersions.upstreamTemplateVersion,
    })
    .from(configVersions)
    .where(isNotNull(configVersions.upstreamTemplateId))
  const adopted = new Set(rows.filter((r) => r.kind === 'application_type').map((r) => r.starterId))
  const recordedVersions = new Map<string, number>()
  for (const r of rows) {
    const id = `${r.starterId}/${r.kind}/${r.key}`
    recordedVersions.set(id, Math.max(recordedVersions.get(id) ?? 0, r.version ?? 0))
  }
  for (const starter of NH_STARTERS) {
    if (!adopted.has(starter.id)) continue
    const members: ReviewBundle['members'] = []
    for (const member of membersInOrder(starter)) {
      const recorded = recordedVersions.get(`${starter.id}/${member.kind}/${member.key}`) ?? 0
      const published = await getPublished(db, member.kind, member.key, signal)
      if (published === null || recorded >= starter.version) continue
      const entries = starterDiff(published.body, member.body)
      if (entries.length === 0) continue
      members.push({
        kind: member.kind,
        key: member.key,
        label: memberLabel(published.body, starter.applicationType.label),
        entries,
      })
    }
    if (members.length > 0) {
      bundles.push({
        starterId: starter.id,
        label: starter.applicationType.label,
        upstreamVersion: starter.version,
        members,
      })
    }
  }
  return bundles
}
