import { Readable } from 'node:stream'
import { createObjectStore } from '@/features/storage/objectStore'
import { err, ok } from '@/types/result'
import type { StorageTarget, TargetError } from './types'

export interface S3Settings {
  endpoint: string
  bucket: string
  prefix: string
  region: string
}

export interface S3Credentials {
  accessKeyId: string
  secretAccessKey: string
}

const OCTET_STREAM = 'application/octet-stream'

function failure(e: unknown): TargetError {
  const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
  if (status === 401 || status === 403)
    return { kind: 'denied', detail: 'the storage refused access' }
  if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
    return { kind: 'bad_shape', detail: `the storage rejected the request (${status})` }
  }
  return { kind: 'unreachable', detail: 'the storage did not answer' }
}

export function createS3Target(settings: S3Settings, credentials: S3Credentials): StorageTarget {
  const store = createObjectStore({
    endpoint: settings.endpoint,
    publicEndpoint: settings.endpoint,
    bucket: settings.bucket,
    region: settings.region,
    ...credentials,
  })
  const keyOf = (path: string) => `${settings.prefix}${path}`
  return {
    kind: 's3',
    async put(path, body, _size, signal) {
      try {
        await store.upload(keyOf(path), body, OCTET_STREAM, signal)
        return ok(undefined)
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') throw e
        return err(failure(e))
      }
    },
    async exists(path, signal) {
      try {
        return ok((await store.head(keyOf(path), signal)).ok)
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') throw e
        return err(failure(e))
      }
    },
    async get(path, signal) {
      try {
        const stream = await store.getStream(keyOf(path), signal)
        if (!stream.ok) return err('not_found')
        return ok(Readable.fromWeb(stream.value as never))
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') throw e
        return err(failure(e))
      }
    },
  }
}
