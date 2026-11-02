import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface PagerRequest {
  method: string
  path: string
  body: unknown
}

export interface PagerFakeServer {
  eventsUrl: string
  requests: PagerRequest[]
  failNext(status: number): void
  stop(): Promise<void>
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  return text === '' ? null : (JSON.parse(text) as unknown)
}

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

export async function startPagerFakeServer(): Promise<PagerFakeServer> {
  const requests: PagerRequest[] = []
  let failure: number | null = null
  const server = createServer((req, res) => {
    void readJson(req).then((body) => {
      requests.push({ method: req.method ?? '', path: req.url ?? '', body })
      if (failure !== null) {
        const status = failure
        failure = null
        reply(res, status, { status: 'error', message: 'rejected' })
        return
      }
      const dedup = (body as { dedup_key?: string } | null)?.dedup_key ?? null
      reply(res, 202, { status: 'success', message: 'Event processed', dedup_key: dedup })
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    eventsUrl: `http://127.0.0.1:${port}/v2/enqueue`,
    requests,
    failNext(status) {
      failure = status
    },
    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
