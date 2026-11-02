import { contentDisposition, type ObjectStore } from '@/features/storage/objectStore'

export interface StoredObject {
  storageKey: string
  filename: string
  contentType: string
}

export type Delivery = { kind: 'redirect'; url: string } | { kind: 'stream'; object: StoredObject }

const STREAM_TIMEOUT_MS = 10 * 60 * 1000

export const STREAMED_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "sandbox; default-src 'none'; frame-ancestors 'none'",
} as const

export async function streamStoredObject(
  store: ObjectStore,
  object: StoredObject,
): Promise<Response | null> {
  const body = await store.getStream(object.storageKey, AbortSignal.timeout(STREAM_TIMEOUT_MS))
  if (!body.ok) return null
  return new Response(body.value, {
    status: 200,
    headers: {
      ...STREAMED_HEADERS,
      'content-type': object.contentType,
      'content-disposition': contentDisposition('inline', object.filename),
    },
  })
}
