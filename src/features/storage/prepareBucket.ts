import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3'
import {
  allowBucketKey,
  ensureGlobalBucket,
  type GarageAdminConfig,
  type GarageAdminFailure,
} from '@/features/storage/garageAdmin'
import type { ObjectStoreConfig } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

const BROWSER_METHODS = ['GET', 'PUT', 'HEAD']
const CORS_MAX_AGE_SECONDS = 3600

async function putBucketCors(
  config: ObjectStoreConfig,
  origins: readonly string[],
  signal: AbortSignal,
): Promise<Result<void, GarageAdminFailure>> {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })
  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: config.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: [...origins],
              AllowedMethods: BROWSER_METHODS,
              AllowedHeaders: ['*'],
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: CORS_MAX_AGE_SECONDS,
            },
          ],
        },
      }),
      { abortSignal: signal },
    )
    return ok(undefined)
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    return err({
      operation: 'PutBucketCors',
      status: status ?? 0,
      message: e instanceof Error ? e.message : String(e),
    })
  } finally {
    client.destroy()
  }
}

export async function prepareBucket(
  config: ObjectStoreConfig,
  admin: GarageAdminConfig,
  corsOrigins: readonly string[],
  signal: AbortSignal,
): Promise<Result<void, GarageAdminFailure>> {
  const bucket = await ensureGlobalBucket(admin, config.bucket, signal)
  if (!bucket.ok) return bucket
  const allowed = await allowBucketKey(admin, bucket.value, config.accessKeyId, signal)
  if (!allowed.ok) return allowed
  return await putBucketCors(config, corsOrigins, signal)
}
