import { z } from 'zod'
import { err, ok, type Result } from '@/types/result'

export interface GarageAdminConfig {
  endpoint: string
  token: string
}

export interface GarageAdminFailure {
  operation: string
  status: number
  message: string
}

const BucketInfo = z.object({ id: z.string().min(1) })

async function call(
  admin: GarageAdminConfig,
  operation: string,
  request: { query?: Record<string, string>; body?: unknown },
  signal: AbortSignal,
): Promise<Response> {
  const url = new URL(`/v2/${operation}`, admin.endpoint)
  for (const [name, value] of Object.entries(request.query ?? {})) {
    url.searchParams.set(name, value)
  }
  return await fetch(url, {
    method: request.body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${admin.token}`, 'content-type': 'application/json' },
    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    signal,
  })
}

async function failure(
  operation: string,
  res: Response,
): Promise<{ ok: false; error: GarageAdminFailure }> {
  return err({ operation, status: res.status, message: (await res.text()).slice(0, 500) })
}

async function bucketId(
  operation: string,
  res: Response,
): Promise<Result<string, GarageAdminFailure>> {
  const body = await res.text()
  const parsed = BucketInfo.safeParse(parseJson(body))
  return parsed.success
    ? ok(parsed.data.id)
    : err({ operation, status: res.status, message: body.slice(0, 500) })
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

async function findGlobalBucket(
  admin: GarageAdminConfig,
  alias: string,
  signal: AbortSignal,
): Promise<Result<string | null, GarageAdminFailure>> {
  const res = await call(admin, 'GetBucketInfo', { query: { globalAlias: alias } }, signal)
  if (res.ok) return await bucketId('GetBucketInfo', res)
  if (res.status === 404) {
    await res.body?.cancel()
    return ok(null)
  }
  return await failure('GetBucketInfo', res)
}

export async function ensureGlobalBucket(
  admin: GarageAdminConfig,
  alias: string,
  signal: AbortSignal,
): Promise<Result<string, GarageAdminFailure>> {
  const found = await findGlobalBucket(admin, alias, signal)
  if (!found.ok) return found
  if (found.value !== null) return ok(found.value)
  const created = await call(admin, 'CreateBucket', { body: { globalAlias: alias } }, signal)
  if (created.ok) return await bucketId('CreateBucket', created)
  if (created.status !== 409) return await failure('CreateBucket', created)
  await created.body?.cancel()
  const raced = await findGlobalBucket(admin, alias, signal)
  if (!raced.ok) return raced
  return raced.value === null
    ? err({ operation: 'CreateBucket', status: 409, message: `bucket ${alias} vanished` })
    : ok(raced.value)
}

export async function allowBucketKey(
  admin: GarageAdminConfig,
  bucket: string,
  accessKeyId: string,
  signal: AbortSignal,
): Promise<Result<void, GarageAdminFailure>> {
  const res = await call(
    admin,
    'AllowBucketKey',
    {
      body: {
        bucketId: bucket,
        accessKeyId,
        permissions: { read: true, write: true, owner: true },
      },
    },
    signal,
  )
  if (!res.ok) return await failure('AllowBucketKey', res)
  await res.body?.cancel()
  return ok(undefined)
}
