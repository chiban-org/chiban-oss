import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import driveItem from '@/test/fixtures/graph/drive_item.json'
import notFound from '@/test/fixtures/graph/error_not_found.json'
import unauthorized from '@/test/fixtures/graph/error_unauthorized.json'
import tokenOk from '@/test/fixtures/graph/token.json'
import tokenError from '@/test/fixtures/graph/token_error.json'
import uploadSession from '@/test/fixtures/graph/upload_session.json'
import { FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, FAKE_TENANT_ID } from './graphFakeServer'

export const FAKE_DRIVE_ID = 'b!fake-drive-id'
export const SIMPLE_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024
export const CHUNK_MULTIPLE_BYTES = 320 * 1024

export interface DriveRequest {
  method: string
  path: string
  headers: Record<string, string>
  bytes: number
}

export interface OneDriveFakeServer {
  authorityBase: string
  graphBase: string
  files: Map<string, Buffer>
  requests: DriveRequest[]
  sessionsCreated: string[]
  tokensIssued(): number
  failNext(status: number): void
  failPathsEnding(suffix: string | null): void
  stop(): Promise<void>
}

interface Session {
  path: string
  chunks: Buffer[]
  received: number
}

const TOKEN_PATH = new RegExp(`^/${FAKE_TENANT_ID}/oauth2/v2\\.0/token$`)
const DRIVE_PATH = new RegExp(
  `^/v1\\.0/drives/${encodeURIComponent(FAKE_DRIVE_ID)}/root:/(.+?)(:/content|:/createUploadSession|:/children)?$`,
)
const UPLOAD_PATH = /^\/upload\/([0-9a-f-]+)$/
const CONTENT_RANGE = /^bytes (\d+)-(\d+)\/(\d+)$/
const CHILDREN_PAGE_SIZE = 2

async function readBytes(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

export async function startOneDriveFakeServer(): Promise<OneDriveFakeServer> {
  const files = new Map<string, Buffer>()
  const requests: DriveRequest[] = []
  const sessions = new Map<string, Session>()
  const sessionsCreated: string[] = []
  const issued = new Set<string>()
  let failure: number | null = null
  let failingSuffix: string | null = null
  let base = ''

  const tokenRoute = (form: URLSearchParams) => {
    const valid =
      form.get('client_id') === FAKE_CLIENT_ID &&
      form.get('client_secret') === FAKE_CLIENT_SECRET &&
      form.get('grant_type') === 'client_credentials' &&
      form.get('scope') === 'https://graph.microsoft.com/.default'
    if (!valid) return { status: 401, body: tokenError }
    const token = `${tokenOk.access_token}-${randomUUID()}`
    issued.add(token)
    return { status: 200, body: { ...tokenOk, access_token: token } }
  }

  const item = (path: string, size: number) => ({
    ...driveItem,
    id: randomUUID(),
    name: path.split('/').pop(),
    size,
  })

  const uploadRoute = (
    req: IncomingMessage,
    res: ServerResponse,
    id: string,
    bytes: Buffer,
  ): void => {
    const session = sessions.get(id)
    const range = CONTENT_RANGE.exec(String(req.headers['content-range'] ?? ''))
    if (session === undefined || range === null || req.method !== 'PUT') {
      return sendJson(res, 404, notFound)
    }
    const [start, end, total] = [Number(range[1]), Number(range[2]), Number(range[3])]
    const lastChunk = end + 1 === total
    const aligned = bytes.length % CHUNK_MULTIPLE_BYTES === 0
    if (
      start !== session.received ||
      end - start + 1 !== bytes.length ||
      (!lastChunk && !aligned)
    ) {
      return sendJson(res, 416, { error: { code: 'invalidRange', message: 'bad range' } })
    }
    session.chunks.push(bytes)
    session.received += bytes.length
    if (!lastChunk) {
      return sendJson(res, 202, { nextExpectedRanges: [`${session.received}-${total - 1}`] })
    }
    files.set(session.path, Buffer.concat(session.chunks))
    sessions.delete(id)
    sendJson(res, 201, item(session.path, total))
  }

  const childrenRoute = (req: IncomingMessage, res: ServerResponse, folder: string): void => {
    const inside = [...files.entries()].filter(([key]) => key.startsWith(`${folder}/`))
    if (inside.length === 0) return sendJson(res, 404, notFound)
    const children = new Map<string, unknown>()
    for (const [key, bytes] of inside) {
      const [name = '', ...deeper] = key.slice(folder.length + 1).split('/')
      children.set(
        name,
        deeper.length === 0 ? { ...item(key, bytes.length), file: {} } : { name, folder: {} },
      )
    }
    const url = new URL(req.url ?? '/', base)
    const skip = Number(url.searchParams.get('skip') ?? '0')
    const all = [...children.values()]
    const page = all.slice(skip, skip + CHILDREN_PAGE_SIZE)
    const next = skip + CHILDREN_PAGE_SIZE
    sendJson(res, 200, {
      value: page,
      ...(next < all.length ? { '@odata.nextLink': `${base}${url.pathname}?skip=${next}` } : {}),
    })
  }

  const listOrDeleteRoute = (
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    suffix: string,
  ): void => {
    if (req.method === 'GET' && suffix === ':/children') return childrenRoute(req, res, path)
    if (req.method !== 'DELETE' || suffix !== '' || !files.delete(path)) {
      return sendJson(res, 404, notFound)
    }
    res.writeHead(204)
    res.end()
  }

  const refused = (req: IncomingMessage, res: ServerResponse, path: string): boolean => {
    const bearer = (req.headers.authorization ?? '').replace('Bearer ', '')
    if (!issued.has(bearer)) {
      sendJson(res, 401, unauthorized)
      return true
    }
    if (failingSuffix !== null && path.endsWith(failingSuffix) && req.method !== 'GET') {
      sendJson(res, 503, { error: { code: 'serviceNotAvailable', message: 'injected' } })
      return true
    }
    return false
  }

  const driveRoute = (
    req: IncomingMessage,
    res: ServerResponse,
    match: RegExpExecArray,
    bytes: Buffer,
  ): void => {
    const path = decodeURIComponent(match[1] ?? '')
    const suffix = match[2] ?? ''
    if (refused(req, res, path)) return
    if (req.method === 'PUT' && suffix === ':/content') {
      if (bytes.length > SIMPLE_UPLOAD_LIMIT_BYTES) {
        return sendJson(res, 413, { error: { code: 'tooLarge', message: 'use an upload session' } })
      }
      files.set(path, bytes)
      return sendJson(res, 201, item(path, bytes.length))
    }
    if (req.method === 'POST' && suffix === ':/createUploadSession') {
      const id = randomUUID()
      sessions.set(id, { path, chunks: [], received: 0 })
      sessionsCreated.push(path)
      return sendJson(res, 200, { ...uploadSession, uploadUrl: `${base}/upload/${id}` })
    }
    if (req.method === 'DELETE' || suffix === ':/children') {
      return listOrDeleteRoute(req, res, path, suffix)
    }
    const stored = files.get(path)
    if (req.method !== 'GET' || stored === undefined) return sendJson(res, 404, notFound)
    if (suffix === '') return sendJson(res, 200, item(path, stored.length))
    res.writeHead(200, { 'content-type': 'application/octet-stream' })
    res.end(stored)
  }

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = new URL(req.url ?? '/', 'http://fake').pathname
    const bytes = await readBytes(req)
    requests.push({
      method: req.method ?? 'GET',
      path,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.join(',') : (v ?? ''),
        ]),
      ),
      bytes: bytes.length,
    })
    if (failure !== null) {
      const status = failure
      failure = null
      return sendJson(res, status, { error: { code: 'fake', message: 'injected failure' } })
    }
    if (req.method === 'POST' && TOKEN_PATH.test(path)) {
      const routed = tokenRoute(new URLSearchParams(bytes.toString('utf8')))
      return sendJson(res, routed.status, routed.body)
    }
    const upload = UPLOAD_PATH.exec(path)
    if (upload !== null) return uploadRoute(req, res, upload[1] ?? '', bytes)
    const drive = DRIVE_PATH.exec(new URL(req.url ?? '/', 'http://fake').pathname)
    if (drive === null) return sendJson(res, 404, notFound)
    driveRoute(req, res, drive, bytes)
  }

  const server: Server = createServer((req, res) => {
    handle(req, res).catch(() => sendJson(res, 500, { error: { message: 'fake failure' } }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    authorityBase: base,
    graphBase: base,
    files,
    requests,
    sessionsCreated,
    tokensIssued: () => issued.size,
    failNext: (status) => {
      failure = status
    },
    failPathsEnding: (suffix) => {
      failingSuffix = suffix
    },
    stop: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
