import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import checkoutCreated from '@/test/fixtures/clover/checkout_created.json'

export interface RecordedRequest {
  method: string
  path: string
  headers: Record<string, string>
  body: unknown
}

export interface CloverFakeServer {
  apiBase: string
  ecommBase: string
  requests: RecordedRequest[]
  setPayment(id: string, body: unknown): void
  setCardPresent(mode: 'ok' | 'timeout' | 'error'): void
  reset(): void
  stop(): Promise<void>
}

export interface CloverFakeExpectations {
  token: string
  merchantId: string
}

const CARD_PRESENT_PAYMENT_ID = 'PAYMENT_CARD_PRESENT'
const REFUND_ID = 'REFUND1ALDER'

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  return text === '' ? null : (JSON.parse(text) as unknown)
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

export async function startCloverFakeServer(
  expected: CloverFakeExpectations,
): Promise<CloverFakeServer> {
  const payments = new Map<string, unknown>()
  const requests: RecordedRequest[] = []
  const held: ServerResponse[] = []
  let cardPresent: 'ok' | 'timeout' | 'error' = 'ok'

  const authorized = (req: IncomingMessage, needsMerchantHeader: boolean): boolean => {
    if (req.headers.authorization !== `Bearer ${expected.token}`) return false
    return !needsMerchantHeader || req.headers['x-clover-merchant-id'] === expected.merchantId
  }

  const lookup = (req: IncomingMessage, path: string): { status: number; body: unknown } | null => {
    const merchantPath = `/v3/merchants/${expected.merchantId}`
    if (req.method !== 'GET' || !authorized(req, false)) return null
    if (path === merchantPath)
      return { status: 200, body: { id: expected.merchantId, name: 'Town of Alder Pond' } }
    if (!path.startsWith(`${merchantPath}/payments/`)) return null
    const payment = payments.get(path.slice(`${merchantPath}/payments/`.length))
    return payment === undefined
      ? { status: 404, body: { message: 'Not Found' } }
      : { status: 200, body: payment }
  }

  const mutate = (path: string, body: unknown): { status: number; body: unknown } | null => {
    if (path === '/invoicingcheckoutservice/v1/checkouts')
      return { status: 200, body: checkoutCreated }
    if (path === '/v1/refunds') {
      return { status: 200, body: { id: REFUND_ID, amount: (body as { amount: number }).amount } }
    }
    if (path !== '/connect/v1/payments') return null
    return cardPresent === 'error'
      ? { status: 503, body: { message: 'Service Unavailable' } }
      : { status: 200, body: { id: CARD_PRESENT_PAYMENT_ID } }
  }

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = new URL(req.url ?? '/', 'http://fake').pathname
    const body = await readBody(req)
    requests.push({
      method: req.method ?? 'GET',
      path,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.join(',') : (v ?? ''),
        ]),
      ),
      body,
    })
    const looked = lookup(req, path)
    if (looked !== null) return send(res, looked.status, looked.body)
    if (path.startsWith('/v3/') && !authorized(req, false)) {
      return send(res, 401, { message: '401 Unauthorized' })
    }
    if (req.method !== 'POST') return send(res, 404, { message: 'Not Found' })
    if (!authorized(req, true)) return send(res, 401, { message: '401 Unauthorized' })
    if (path === '/connect/v1/payments' && cardPresent === 'timeout') {
      held.push(res)
      return
    }
    const mutated = mutate(path, body)
    send(res, mutated?.status ?? 404, mutated?.body ?? { message: 'Not Found' })
  }

  const server: Server = createServer((req, res) => {
    handle(req, res).catch(() => send(res, 500, { message: 'fake failure' }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    apiBase: base,
    ecommBase: base,
    requests,
    setPayment: (id, body) => {
      payments.set(id, body)
    },
    setCardPresent: (mode) => {
      cardPresent = mode
    },
    reset: () => {
      requests.length = 0
      payments.clear()
      cardPresent = 'ok'
      for (const res of held.splice(0)) res.destroy()
    },
    stop: async () => {
      for (const res of held.splice(0)) res.destroy()
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
