import { createHash } from 'node:crypto'
import { PassThrough, Readable, Transform } from 'node:stream'
import type { Db } from '@/db/client'
import { files } from '@/db/schema'
import { TargetFailure } from '@/features/export/targets/targetFailure'
import type { createTarSink } from '@/features/export/tarSink'
import type { ObjectStore } from '@/features/storage/objectStore'

export interface ObjectRecord {
  key: string
  size: number
  sha256: string
}

export class MissingObjects extends Error {
  constructor(readonly keys: string[]) {
    super(`missing objects: ${keys.join(', ')}`)
  }
}

export async function referencedKeys(db: Db): Promise<string[]> {
  const rows = await db.select({ key: files.storageKey }).from(files)
  return rows.map((r) => r.key)
}

export async function unreadableKeys(
  store: ObjectStore,
  keys: string[],
  signal: AbortSignal,
): Promise<string[]> {
  const missing: string[] = []
  for (const key of keys) {
    signal.throwIfAborted()
    if (!(await store.head(key, signal)).ok) missing.push(key)
  }
  return missing
}

function hashing(): { transform: Transform; digest(): { sha256: string; size: number } } {
  const hash = createHash('sha256')
  let size = 0
  return {
    transform: new Transform({
      transform(chunk: Buffer, _enc, cb) {
        hash.update(chunk)
        size += chunk.length
        cb(null, chunk)
      },
    }),
    digest: () => ({ sha256: hash.digest('hex'), size }),
  }
}

export async function writeObject(
  store: ObjectStore,
  tar: ReturnType<typeof createTarSink>,
  key: string,
  signal: AbortSignal,
): Promise<ObjectRecord | null> {
  const head = await store.head(key, signal)
  if (!head.ok) return null
  const stream = await store.getStream(key, signal)
  if (!stream.ok) return null
  const h = hashing()
  const body = new PassThrough()
  const source = Readable.fromWeb(stream.value as never)
  source.on('error', (e) => body.destroy(e))
  source.pipe(h.transform).pipe(body)
  await tar.sink.write({ path: `objects/${key}`, size: head.value.size, body })
  const digest = h.digest()
  if (digest.size !== head.value.size) throw new TargetFailure({ kind: 'bad_shape', detail: key })
  return { key, size: digest.size, sha256: digest.sha256 }
}
