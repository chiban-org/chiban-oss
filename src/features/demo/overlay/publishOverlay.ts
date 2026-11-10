import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import type { ConfigKind } from '@/features/config/kinds'
import { type PublishError, publishConfig } from '@/features/config/publish'
import { getPublished, saveDraft } from '@/features/config/store'
import { DemoOverlayError, joinPath, type OverlayIssue } from '@/features/demo/overlay/overlayIssue'
import type { DemoOverlay } from '@/features/demo/overlay/overlaySchema'

export interface OverlayRun {
  db: Db
  actor: Actor
  overlay: DemoOverlay
  signal: AbortSignal
}

export interface PublishTarget {
  kind: ConfigKind
  key: string
  body: unknown
  path: string
}

export function publishIssue(path: string, error: PublishError | 'unknown_starter'): OverlayIssue {
  if (typeof error === 'object' && 'invalid' in error) {
    const [first] = error.invalid
    if (first !== undefined) return { path: joinPath(path, first.path), message: first.message }
  }
  return { path, message: `the configuration refused it: ${JSON.stringify(error)}` }
}

export async function publishOverlayBody(run: OverlayRun, target: PublishTarget): Promise<void> {
  const input = { kind: target.kind, key: target.key, body: target.body }
  const draft = await saveDraft(run.db, run.actor, input, run.signal)
  if (!draft.ok) throw new DemoOverlayError(publishIssue(target.path, draft.error))
  const published = await publishConfig(run.db, run.actor, draft.value.versionId, run.signal)
  if (!published.ok) throw new DemoOverlayError(publishIssue(target.path, published.error))
}

export async function publishedBody<T>(
  run: OverlayRun,
  input: { kind: ConfigKind; key: string; path: string },
): Promise<T> {
  const row = await getPublished(run.db, input.kind, input.key, run.signal)
  if (row === null) {
    throw new DemoOverlayError({
      path: input.path,
      message: `no published ${input.kind} ${input.key} to apply it to`,
    })
  }
  return row.body as T
}
