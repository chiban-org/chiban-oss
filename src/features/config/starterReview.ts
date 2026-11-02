import { NH_STARTERS } from '@packs/nh/starters'
import { and, eq } from 'drizzle-orm'
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
  for (const starter of NH_STARTERS) {
    const [adoption] = await db
      .select({ id: configVersions.id })
      .from(configVersions)
      .where(
        and(
          eq(configVersions.kind, 'application_type'),
          eq(configVersions.upstreamTemplateId, starter.id),
        ),
      )
    if (adoption === undefined) continue
    const members: ReviewBundle['members'] = []
    for (const member of membersInOrder(starter)) {
      const rows = await db
        .select({ version: configVersions.upstreamTemplateVersion })
        .from(configVersions)
        .where(
          and(
            eq(configVersions.kind, member.kind),
            eq(configVersions.key, member.key),
            eq(configVersions.upstreamTemplateId, starter.id),
          ),
        )
      const recorded = Math.max(0, ...rows.map((r) => r.version ?? 0))
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
