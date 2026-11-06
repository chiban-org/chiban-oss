import { createReadStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { ObjectStore } from '@/features/storage/objectStore'

export async function restoreObjectsFromDir(
  store: ObjectStore,
  dir: string,
  signal: AbortSignal,
): Promise<number> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  let uploaded = 0
  for (const entry of entries) {
    signal.throwIfAborted()
    if (!entry.isFile()) continue
    const full = path.join(entry.parentPath, entry.name)
    const key = path.relative(dir, full).split(path.sep).join('/')
    const body = createReadStream(full)
    try {
      await store.upload(key, body, 'application/octet-stream', signal)
    } finally {
      body.destroy()
    }
    uploaded += 1
  }
  return uploaded
}
