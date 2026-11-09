import type { DbOrTx } from '@/db/client'
import type { ObjectStore } from '@/features/storage/objectStore'
import { publicLogoFor } from '@/features/town/publicTown'
import { readTownImage } from '@/features/town/townImages'

const FILE = /^([0-9a-f]{64})\.(png|jpg)$/

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
}

export async function townLogoResponse(
  db: DbOrTx,
  store: ObjectStore,
  file: string,
  signal: AbortSignal,
): Promise<Response> {
  const match = FILE.exec(file)
  if (match === null) return notFound()
  const [, sha = '', extension] = match
  const logo = await publicLogoFor(db, sha, signal)
  if (logo?.extension !== extension) return notFound()
  const image = await readTownImage(store, sha, signal)
  if (!image.ok) return notFound()
  return new Response(image.value.bytes as BodyInit, {
    status: 200,
    headers: {
      'cache-control': 'public, max-age=86400, immutable',
      'content-type': image.value.contentType,
      'x-content-type-options': 'nosniff',
    },
  })
}
