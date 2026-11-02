import type { Readable } from 'node:stream'
import { readAll } from '@/features/export/readArchive'
import type { StorageTarget, TargetError } from './types'

const SMALL_LIMIT = 256 * 1024 * 1024

export class TargetFailure extends Error {
  readonly error: TargetError

  constructor(error: TargetError) {
    super(error.detail)
    this.error = error
  }
}

export async function getOrThrow(
  target: StorageTarget,
  path: string,
  signal: AbortSignal,
): Promise<Readable> {
  const got = await target.get(path, signal)
  if (got.ok) return got.value
  if (got.error === 'not_found') {
    throw new TargetFailure({ kind: 'bad_shape', detail: `${path} is missing from the target` })
  }
  throw new TargetFailure(got.error)
}

export async function getBytesOrThrow(
  target: StorageTarget,
  path: string,
  signal: AbortSignal,
): Promise<Buffer> {
  return await readAll(await getOrThrow(target, path, signal), SMALL_LIMIT)
}
