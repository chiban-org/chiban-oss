import type { Readable } from 'node:stream'
import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '@/config/env'
import { err, ok, type Result } from '@/types/result'

export interface ObjectStoreConfig {
  endpoint: string
  publicEndpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  region: string
}

export interface PresignPutOptions {
  contentType: string
  contentLength: number
  expiresSeconds: number
}

export interface PresignGetOptions {
  expiresSeconds: number
  filename: string
  contentType: string
  disposition: 'inline' | 'attachment'
  signingDate?: Date
}

export interface ObjectStore {
  readonly bucket: string
  presignPut(key: string, opts: PresignPutOptions): Promise<string>
  presignGet(key: string, opts: PresignGetOptions): Promise<string>
  head(
    key: string,
    signal: AbortSignal,
  ): Promise<Result<{ size: number; etag: string | null }, 'not_found'>>
  getStream(
    key: string,
    signal: AbortSignal,
  ): Promise<Result<ReadableStream<Uint8Array>, 'not_found'>>
  putBytes(key: string, bytes: Uint8Array, contentType: string, signal: AbortSignal): Promise<void>
  upload(key: string, body: Readable, contentType: string, signal: AbortSignal): Promise<void>
  list(prefix: string, signal: AbortSignal): Promise<string[]>
  copy(
    fromKey: string,
    toKey: string,
    signal: AbortSignal,
    options?: { ifMatch?: string },
  ): Promise<void>
  delete(key: string, signal: AbortSignal): Promise<void>
  createBucket(signal: AbortSignal): Promise<void>
  deleteBucket(signal: AbortSignal): Promise<void>
  bucketExists(signal: AbortSignal): Promise<boolean>
}

function clientFor(endpoint: string, config: ObjectStoreConfig): S3Client {
  return new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })
}

function isMissing(e: unknown): boolean {
  const name = e instanceof Error ? e.name : ''
  const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
  return name === 'NotFound' || name === 'NoSuchKey' || name === 'NoSuchBucket' || status === 404
}

function asciiFilename(filename: string): string {
  return filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
}

export function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  return `${kind}; filename="${asciiFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export function createObjectStore(config: ObjectStoreConfig): ObjectStore {
  const server = clientFor(config.endpoint, config)
  const presigner = clientFor(config.publicEndpoint, config)
  const Bucket = config.bucket
  return {
    bucket: Bucket,
    async presignPut(key, opts) {
      return await getSignedUrl(
        presigner,
        new PutObjectCommand({
          Bucket,
          Key: key,
          ContentType: opts.contentType,
          ContentLength: opts.contentLength,
        }),
        {
          expiresIn: opts.expiresSeconds,
          signableHeaders: new Set(['content-type', 'content-length']),
        },
      )
    },
    async presignGet(key, opts) {
      const disposition = contentDisposition(opts.disposition, opts.filename)
      return await getSignedUrl(
        presigner,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ResponseContentType: opts.contentType,
          ResponseContentDisposition: disposition,
        }),
        {
          expiresIn: opts.expiresSeconds,
          ...(opts.signingDate === undefined ? {} : { signingDate: opts.signingDate }),
        },
      )
    },
    async head(key, signal) {
      try {
        const out = await server.send(new HeadObjectCommand({ Bucket, Key: key }), {
          abortSignal: signal,
        })
        return ok({ size: out.ContentLength ?? 0, etag: out.ETag ?? null })
      } catch (e) {
        if (isMissing(e)) return err('not_found')
        throw e
      }
    },
    async getStream(key, signal) {
      try {
        const out = await server.send(new GetObjectCommand({ Bucket, Key: key }), {
          abortSignal: signal,
        })
        if (out.Body === undefined) return err('not_found')
        return ok(out.Body.transformToWebStream() as ReadableStream<Uint8Array>)
      } catch (e) {
        if (isMissing(e)) return err('not_found')
        throw e
      }
    },
    async putBytes(key, bytes, contentType, signal) {
      await server.send(
        new PutObjectCommand({ Bucket, Key: key, Body: bytes, ContentType: contentType }),
        { abortSignal: signal },
      )
    },
    async upload(key, body, contentType, signal) {
      const upload = new Upload({
        client: server,
        params: { Bucket, Key: key, Body: body, ContentType: contentType },
      })
      const abort = () => void upload.abort()
      signal.addEventListener('abort', abort, { once: true })
      try {
        await upload.done()
      } finally {
        signal.removeEventListener('abort', abort)
      }
    },
    async list(prefix, signal) {
      const keys: string[] = []
      let token: string | undefined
      do {
        const out = await server.send(
          new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }),
          { abortSignal: signal },
        )
        for (const item of out.Contents ?? []) if (item.Key !== undefined) keys.push(item.Key)
        token = out.IsTruncated === true ? out.NextContinuationToken : undefined
      } while (token !== undefined)
      return keys
    },
    async copy(fromKey, toKey, signal, options) {
      await server.send(
        new CopyObjectCommand({
          Bucket,
          Key: toKey,
          ...(options?.ifMatch === undefined ? {} : { CopySourceIfMatch: options.ifMatch }),
          CopySource: `${Bucket}/${encodeURIComponent(fromKey).replaceAll('%2F', '/')}`,
        }),
        { abortSignal: signal },
      )
    },
    async delete(key, signal) {
      await server.send(new DeleteObjectCommand({ Bucket, Key: key }), { abortSignal: signal })
    },
    async createBucket(signal) {
      await server.send(new CreateBucketCommand({ Bucket }), { abortSignal: signal })
    },
    async deleteBucket(signal) {
      await server.send(new DeleteBucketCommand({ Bucket }), { abortSignal: signal })
    },
    async bucketExists(signal) {
      try {
        await server.send(new HeadBucketCommand({ Bucket }), { abortSignal: signal })
        return true
      } catch (e) {
        if (isMissing(e)) return false
        throw e
      }
    },
  }
}

export function isPreconditionFailure(e: unknown): boolean {
  const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
  return status === 412 || (e instanceof Error && e.name === 'PreconditionFailed')
}

export async function ensureBucket(store: ObjectStore, signal: AbortSignal): Promise<void> {
  if (await store.bucketExists(signal)) return
  await store.createBucket(signal)
}

export function objectStoreConfigFromEnv(): ObjectStoreConfig {
  return {
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    region: env.S3_REGION,
  }
}

let shared: ObjectStore | undefined

export function getObjectStore(): ObjectStore {
  shared ??= createObjectStore(objectStoreConfigFromEnv())
  return shared
}
