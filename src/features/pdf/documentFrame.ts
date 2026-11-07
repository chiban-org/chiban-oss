import type { DbOrTx } from '@/db/client'
import { getPublished } from '@/features/config/store'
import { buildFrame, type DocumentFrame, type FrameImage } from '@/features/pdf/frame'
import { getObjectStore, type ObjectStore } from '@/features/storage/objectStore'
import {
  type TownImage,
  type TownProfileBody,
  TownProfileBodySchema,
} from '@/features/town/profileSchema'
import { getTownSettings } from '@/features/town/settings'

export async function loadTownProfile(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<TownProfileBody | null> {
  const row = await getPublished(db, 'town_profile', 'default', signal)
  if (row === null) return null
  const parsed = TownProfileBodySchema.safeParse(row.body)
  return parsed.success ? parsed.data : null
}

function imagesOf(profile: TownProfileBody): TownImage[] {
  const signatures = profile.signers.flatMap((s) => (s.signature === null ? [] : [s.signature]))
  return profile.logo === null ? signatures : [profile.logo, ...signatures]
}

async function fetchImage(
  store: ObjectStore,
  image: TownImage,
  signal: AbortSignal,
): Promise<FrameImage | null> {
  const stream = await store.getStream(image.objectKey, signal)
  if (!stream.ok) return null
  const bytes = new Uint8Array(await new Response(stream.value).arrayBuffer())
  return { bytes, contentType: image.contentType, width: image.width, height: image.height }
}

export async function loadFrameImages(
  store: ObjectStore,
  profile: TownProfileBody,
  signal: AbortSignal,
): Promise<Map<string, FrameImage>> {
  const images = new Map<string, FrameImage>()
  for (const image of imagesOf(profile)) {
    if (images.has(image.objectKey)) continue
    const fetched = await fetchImage(store, image, signal)
    if (fetched !== null) images.set(image.objectKey, fetched)
  }
  return images
}

export async function documentFrame(
  db: DbOrTx,
  scope: { boardId?: string | null },
  signal: AbortSignal,
  store: ObjectStore = getObjectStore(),
): Promise<DocumentFrame> {
  signal.throwIfAborted()
  const town = await getTownSettings(db, signal)
  const townName = town.ok ? town.value.name : ''
  const profile = await loadTownProfile(db, signal)
  const images = profile === null ? new Map() : await loadFrameImages(store, profile, signal)
  return buildFrame(townName, profile, scope.boardId ?? undefined, images)
}
