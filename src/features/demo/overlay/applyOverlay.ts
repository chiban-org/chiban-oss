import type { Db } from '@/db/client'
import { applyOverlaySettings } from '@/features/demo/overlay/applySettings'
import {
  applyOverlayStarters,
  type StarterOverlayReport,
} from '@/features/demo/overlay/applyStarters'
import type { DemoOverlay } from '@/features/demo/overlay/overlaySchema'
import { actorFor } from '@/features/demo/seedPermitSupport'

export type { StarterOverlayReport }

export const DEMO_TOWN_NAME = 'Town of Alder Pond'

export function overlayTownName(overlay: DemoOverlay | undefined): string {
  return overlay?.town?.name ?? DEMO_TOWN_NAME
}

export async function applyOverlayBeforeStory(
  db: Db,
  overlay: DemoOverlay,
  signal: AbortSignal,
): Promise<StarterOverlayReport> {
  const actor = await actorFor(db, 'admin', signal)
  return await applyOverlayStarters({ db, actor, overlay, signal })
}

export async function applyOverlayAfterStory(
  db: Db,
  overlay: DemoOverlay,
  signal: AbortSignal,
): Promise<void> {
  const actor = await actorFor(db, 'admin', signal)
  await applyOverlaySettings({ db, actor, overlay, signal })
}
