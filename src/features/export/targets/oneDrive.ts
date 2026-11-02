import { Readable } from 'node:stream'
import { z } from 'zod'
import { createTokenProvider, type TokenDeps } from '@/features/microsoft/graphToken'
import { err, ok, type Result } from '@/types/result'
import type { StorageTarget, TargetError } from './types'

export const ONEDRIVE_TARGET_STATUS = 'stubbed' as const

export const ONEDRIVE_STUB_NOTE =
  'OneDrive and SharePoint copies are not connected to a live Microsoft 365 tenant. They have only been tested against a local stand-in.'

export interface OneDriveAccount {
  tenantId: string
  clientId: string
  driveId: string
  authorityBase: string
  graphBase: string
}

const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024
const CHUNK_BYTES = 3_276_800
const UploadSessionSchema = z.object({ uploadUrl: z.url() })

function statusFailure(status: number): TargetError {
  if (status === 401 || status === 403) {
    return { kind: 'denied', detail: `Microsoft refused the request (${status})` }
  }
  if (status === 429 || status >= 500) {
    return { kind: 'unreachable', detail: `Microsoft answered ${status}` }
  }
  return { kind: 'bad_shape', detail: `Microsoft rejected the request (${status})` }
}

async function readExactly(
  iterator: AsyncIterator<Buffer>,
  pending: Buffer[],
  wanted: number,
): Promise<Buffer> {
  let held = pending.reduce((n, b) => n + b.length, 0)
  while (held < wanted) {
    const next = await iterator.next()
    if (next.done === true) break
    pending.push(next.value)
    held += next.value.length
  }
  const all = Buffer.concat(pending)
  pending.length = 0
  if (all.length > wanted) pending.push(all.subarray(wanted))
  return all.subarray(0, wanted)
}

function bytesOf(body: Readable): AsyncIterator<Buffer> {
  return (async function* () {
    for await (const chunk of body) yield Buffer.from(chunk as Uint8Array)
  })()
}

export function createOneDriveTarget(
  account: OneDriveAccount,
  secret: string,
  deps: TokenDeps,
): StorageTarget {
  const tokens = createTokenProvider(account, secret, deps)
  const itemUrl = (path: string, suffix: string) =>
    `${account.graphBase}/v1.0/drives/${encodeURIComponent(account.driveId)}/root:/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}${suffix}`

  async function send(
    url: string,
    init: RequestInit,
    authorized: boolean,
    signal: AbortSignal,
  ): Promise<Result<Response, TargetError>> {
    const headers = new Headers(init.headers)
    if (authorized) {
      const token = await tokens.get(signal)
      if (!token.ok) {
        const kind = token.error.kind === 'auth_failed' ? 'denied' : token.error.kind
        return err({ kind, detail: token.error.detail })
      }
      headers.set('authorization', `Bearer ${token.value}`)
    }
    try {
      return ok(await deps.fetch(url, { ...init, headers, signal }))
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e
      return err({ kind: 'unreachable', detail: 'Microsoft did not answer' })
    }
  }

  async function simplePut(path: string, bytes: Buffer, signal: AbortSignal) {
    const sent = await send(
      itemUrl(path, ':/content'),
      {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array(bytes),
      },
      true,
      signal,
    )
    if (!sent.ok) return sent
    return sent.value.ok ? ok(undefined) : err(statusFailure(sent.value.status))
  }

  async function sessionPut(path: string, body: Readable, size: number, signal: AbortSignal) {
    const created = await send(
      itemUrl(path, ':/createUploadSession'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
      },
      true,
      signal,
    )
    if (!created.ok) return created
    if (!created.value.ok) return err(statusFailure(created.value.status))
    const session = UploadSessionSchema.safeParse(await created.value.json().catch(() => null))
    if (!session.success)
      return err({ kind: 'bad_shape', detail: 'upload session had no URL' } as const)
    const iterator = bytesOf(body)
    const pending: Buffer[] = []
    for (let start = 0; start < size; start += CHUNK_BYTES) {
      const chunk = await readExactly(iterator, pending, Math.min(CHUNK_BYTES, size - start))
      if (chunk.length !== Math.min(CHUNK_BYTES, size - start)) {
        return err({ kind: 'bad_shape', detail: 'body is shorter than its size' } as const)
      }
      const sent = await send(
        session.data.uploadUrl,
        {
          method: 'PUT',
          headers: { 'content-range': `bytes ${start}-${start + chunk.length - 1}/${size}` },
          body: new Uint8Array(chunk),
        },
        false,
        signal,
      )
      if (!sent.ok) return sent
      if (!sent.value.ok) return err(statusFailure(sent.value.status))
    }
    return ok(undefined)
  }

  return {
    kind: 'onedrive',
    async put(path, body, size, signal) {
      if (size > SIMPLE_UPLOAD_LIMIT) return await sessionPut(path, body, size, signal)
      const chunks: Buffer[] = []
      for await (const chunk of body) chunks.push(Buffer.from(chunk as Uint8Array))
      const bytes = Buffer.concat(chunks)
      if (bytes.length !== size) {
        return err({ kind: 'bad_shape', detail: 'body differs from its size' })
      }
      return await simplePut(path, bytes, signal)
    },
    async exists(path, signal) {
      const sent = await send(itemUrl(path, ''), { method: 'GET' }, true, signal)
      if (!sent.ok) return sent
      if (sent.value.status === 404) return ok(false)
      return sent.value.ok ? ok(true) : err(statusFailure(sent.value.status))
    },
    async get(path, signal) {
      const sent = await send(itemUrl(path, ':/content'), { method: 'GET' }, true, signal)
      if (!sent.ok) return sent
      if (sent.value.status === 404) return err('not_found')
      if (!sent.value.ok || sent.value.body === null) return err(statusFailure(sent.value.status))
      return ok(Readable.fromWeb(sent.value.body as never))
    },
  }
}
