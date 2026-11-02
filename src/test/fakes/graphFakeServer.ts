import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import notFound from '@/test/fixtures/graph/error_not_found.json'
import unauthorized from '@/test/fixtures/graph/error_unauthorized.json'
import eventCreated from '@/test/fixtures/graph/event_created.json'
import tokenOk from '@/test/fixtures/graph/token.json'
import tokenError from '@/test/fixtures/graph/token_error.json'

export const FAKE_TENANT_ID = '11111111-2222-3333-4444-555555555555'
export const FAKE_CLIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
export const FAKE_CLIENT_SECRET = 'fake-graph-client-secret'

export interface GraphRequest {
  method: string
  path: string
  headers: Record<string, string>
  body: unknown
}

export interface GraphFakeServer {
  authorityBase: string
  graphBase: string
  events: Map<string, Record<string, unknown>>
  requests: GraphRequest[]
  tokensIssued(): number
  setTokenLifetime(seconds: number): void
  failNext(status: number): void
  stop(): Promise<void>
}

async function readText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function send(res: ServerResponse, status: number, body: unknown): void {
  if (status === 204) {
    res.writeHead(204)
    res.end()
    return
  }
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const EVENT_PATH = /^\/v1\.0\/users\/([^/]+)\/events\/?([^/]*)$/
const TOKEN_PATH = new RegExp(`^/${FAKE_TENANT_ID}/oauth2/v2\\.0/token$`)

export async function startGraphFakeServer(): Promise<GraphFakeServer> {
  const events = new Map<string, Record<string, unknown>>()
  const byTransaction = new Map<string, string>()
  const requests: GraphRequest[] = []
  const issued = new Set<string>()
  let lifetime = tokenOk.expires_in
  let failure: number | null = null

  const tokenRoute = (form: URLSearchParams): { status: number; body: unknown } => {
    const valid =
      form.get('client_id') === FAKE_CLIENT_ID &&
      form.get('client_secret') === FAKE_CLIENT_SECRET &&
      form.get('grant_type') === 'client_credentials' &&
      form.get('scope') === 'https://graph.microsoft.com/.default'
    if (!valid) return { status: 401, body: tokenError }
    const token = `${tokenOk.access_token}-${randomUUID()}`
    issued.add(token)
    return { status: 200, body: { ...tokenOk, expires_in: lifetime, access_token: token } }
  }

  const eventRoute = (
    req: IncomingMessage,
    match: RegExpExecArray,
    body: Record<string, unknown> | null,
  ): { status: number; body: unknown } => {
    const bearer = (req.headers.authorization ?? '').replace('Bearer ', '')
    if (!issued.has(bearer)) return { status: 401, body: unauthorized }
    const id = match[2] === '' ? undefined : match[2]
    if (req.method === 'POST' && id === undefined) {
      const transaction = typeof body?.transactionId === 'string' ? body.transactionId : ''
      const known = byTransaction.get(transaction)
      if (known !== undefined) return { status: 201, body: events.get(known) }
      const created = { ...eventCreated, id: `event-${events.size + 1}`, ...(body ?? {}) }
      events.set(created.id, created)
      byTransaction.set(transaction, created.id)
      return { status: 201, body: created }
    }
    const existing = id === undefined ? undefined : events.get(id)
    if (existing === undefined) return { status: 404, body: notFound }
    if (req.method === 'PATCH') {
      const updated = { ...existing, ...(body ?? {}), id: existing.id }
      events.set(String(existing.id), updated)
      return { status: 200, body: updated }
    }
    if (req.method === 'DELETE') {
      events.delete(String(id))
      return { status: 204, body: null }
    }
    return { status: 404, body: notFound }
  }

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = new URL(req.url ?? '/', 'http://fake').pathname
    const text = await readText(req)
    const contentType = String(req.headers['content-type'] ?? '')
    const parsedBody =
      contentType.includes('json') && text !== ''
        ? (JSON.parse(text) as Record<string, unknown>)
        : null
    requests.push({
      method: req.method ?? 'GET',
      path,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.join(',') : (v ?? ''),
        ]),
      ),
      body: parsedBody ?? text,
    })
    if (failure !== null) {
      const status = failure
      failure = null
      return send(res, status, { error: { code: 'fake', message: 'injected failure' } })
    }
    if (req.method === 'POST' && TOKEN_PATH.test(path)) {
      const routed = tokenRoute(new URLSearchParams(text))
      return send(res, routed.status, routed.body)
    }
    const match = EVENT_PATH.exec(path)
    if (match === null) return send(res, 404, notFound)
    const routed = eventRoute(req, match, parsedBody)
    send(res, routed.status, routed.body)
  }

  const server: Server = createServer((req, res) => {
    handle(req, res).catch(() => send(res, 500, { error: { message: 'fake failure' } }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    authorityBase: base,
    graphBase: base,
    events,
    requests,
    tokensIssued: () => issued.size,
    setTokenLifetime: (seconds) => {
      lifetime = seconds
    },
    failNext: (status) => {
      failure = status
    },
    stop: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
