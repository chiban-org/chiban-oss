import type { Readable } from 'node:stream'
import type { Result } from '@/types/result'

export interface TargetError {
  kind: 'unreachable' | 'denied' | 'bad_shape'
  detail: string
}

export interface StorageTarget {
  kind: 'local_fs' | 's3' | 'onedrive'
  put(
    path: string,
    body: Readable,
    size: number,
    signal: AbortSignal,
  ): Promise<Result<void, TargetError>>
  exists(path: string, signal: AbortSignal): Promise<Result<boolean, TargetError>>
  get(path: string, signal: AbortSignal): Promise<Result<Readable, TargetError | 'not_found'>>
  list(folder: string, signal: AbortSignal): Promise<Result<string[], TargetError>>
  delete(path: string, signal: AbortSignal): Promise<Result<void, TargetError>>
}
