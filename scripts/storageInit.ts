import { env } from '@/config/env'
import { ensureBucket, getObjectStore } from '@/features/storage/objectStore'

await ensureBucket(getObjectStore(), AbortSignal.timeout(30_000))
console.warn(`bucket ${env.S3_BUCKET} ready at ${env.S3_ENDPOINT}`)
