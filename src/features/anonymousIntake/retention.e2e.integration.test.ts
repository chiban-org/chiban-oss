import { execFileSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { env } from '@/config/env'
import { users } from '@/db/schema'
import { handleAnonymousIntake } from '@/features/anonymousIntake/handler'
import { purgeProbes } from '@/features/anonymousIntake/purgeProbe'
import {
  dumpDatabaseText,
  listObjectsForProbe,
  newestBackupIn,
  readBackupForProbe,
} from '@/features/anonymousIntake/retentionCollect'
import {
  type ProbeDeps,
  type ProbeMarkers,
  runRetentionProbe,
} from '@/features/anonymousIntake/retentionProbe'
import { createSession } from '@/features/auth/session'
import { createBackup } from '@/features/backup/createBackup'
import { createLocalFsTarget } from '@/features/export/targets/localFs'
import type { ObjectStore, ObjectStoreConfig } from '@/features/storage/objectStore'
import { createRateLimiter } from '@/server/rateLimiter'
import { openAnonymousIntake } from '@/test/anonymousFixtures'
import { type RunningCaddy, startCaddy } from '@/test/caddy'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const PASSPHRASE = 'correct horse battery staple'
const CONTROL_QUERY = 'control=1'
const ORIGIN = new URL(env.BASE_URL).origin
const NOW = new Date('2027-03-02T15:00:00Z')
let handle: TestDb
let store: ObjectStore
let storeConfig: ObjectStoreConfig
let upstream: Server
let upstreamPort = 0
const appOutput: string[] = []
let backupRoot = ''
let sessionToken = ''
let sessionUserId = ''

function appHandler(): void {
  const limiter = createRateLimiter({ max: 50, windowMs: 60_000 })
  upstream = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      if (req.method !== 'POST') {
        res.writeHead(200).end('ok')
        return
      }
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') headers.set(k, v)
      }
      const request = new Request(`${ORIGIN}${req.url ?? '/'}`, {
        method: 'POST',
        headers,
        body: Buffer.concat(chunks),
      })
      void handleAnonymousIntake(
        { db: handle.db, store, now: () => NOW, limiter, imageRef: null, appVersion: '0.0.0' },
        request,
        signal,
      ).then(async (response) => {
        res.writeHead(response.status, Object.fromEntries(response.headers))
        res.end(Buffer.from(await response.arrayBuffer()))
      })
    })
  })
}

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  const made = await makeTestStore()
  store = made.store
  storeConfig = made.config
  await openAnonymousIntake(handle.db)
  appHandler()
  await new Promise<void>((resolve) => upstream.listen(0, '0.0.0.0', resolve))
  upstreamPort = (upstream.address() as AddressInfo).port
  backupRoot = await mkdtemp(join(tmpdir(), 'chiban-backup-'))
  const resident = await staffActor(handle.db, 'applicant')
  sessionUserId = resident.userId
  await handle.db
    .update(users)
    .set({ email: `probe-${Date.now()}@example.test` })
    .where(eq(users.id, resident.userId))
  const session = await createSession(handle.db, resident.userId, signal)
  if (!session.ok) throw new Error('session')
  sessionToken = session.value.sid
})
afterAll(async () => {
  upstream.close()
  await handle.drop()
})

async function learnClientIp(caddy: RunningCaddy): Promise<string> {
  const control = await fetch(`${caddy.url}/?${CONTROL_QUERY}`)
  expect(control.status).toBe(200)
  const logs = await caddy.logs()
  const line = logs.split('\n').find((l) => l.includes(CONTROL_QUERY) && l.includes('remote_ip'))
  const ip = /"remote_ip":"([^"]+)"/.exec(line ?? '')?.[1]
  if (ip === undefined) throw new Error('the control request was not in the access log')
  return ip
}

function depsFor(caddy: RunningCaddy): ProbeDeps {
  return {
    async submit(markers: ProbeMarkers, token: string) {
      const image = await sharp({
        create: { width: 24, height: 24, channels: 3, background: { r: 200, g: 100, b: 50 } },
      })
        .jpeg()
        .withExif({ IFD0: { Artist: markers.exifArtist } })
        .toBuffer()
      const form = new FormData()
      form.append('location', '14 Birch Lane')
      form.append('description', 'A shed with no permit')
      form.append(
        'photos',
        new File([new Uint8Array(image)], markers.filename, { type: 'image/jpeg' }),
      )
      const response = await fetch(`${caddy.url}/intake/anonymous`, {
        method: 'POST',
        body: form,
        redirect: 'manual',
        headers: {
          'user-agent': markers.userAgent,
          cookie: `chiban_sid=${sessionToken}`,
          'x-chiban-probe': token,
        },
      })
      return { status: response.status }
    },
    dumpDatabase: (s) => dumpDatabaseText(handle.db, s),
    async readLogs() {
      const withoutControl = (await caddy.logs())
        .split('\n')
        .filter((line) => !line.includes(CONTROL_QUERY))
      return `${withoutControl.join('\n')}\n${appOutput.join('')}`
    },
    listObjects: (s) => listObjectsForProbe(storeConfig, store, s),
    async readBackup(s) {
      const made = await createBackup(
        {
          db: handle.db,
          pgDumpPath: 'pg_dump',
          databaseUrl: handle.url,
          store,
          secretKeys: env.CHIBAN_SECRET_KEYS,
          activeKeyId: env.CHIBAN_ACTIVE_KEY_ID,
          passphrase: PASSPHRASE,
          target: createLocalFsTarget({ root: backupRoot }),
          now: NOW,
        },
        s,
      )
      if (!made.ok) return null
      const file = await newestBackupIn(backupRoot)
      if (file === null) return null
      return await readBackupForProbe(
        { file, passphrase: PASSPHRASE, pgRestorePath: 'pg_restore' },
        s,
      )
    },
    purge: (token, s) => purgeProbes(handle.db, store, token, s),
  }
}

function markersFor(clientIp: string): ProbeMarkers {
  const tag = Math.random().toString(36).slice(2, 10)
  return {
    clientIp,
    userAgent: `probe-ua-${tag}`,
    filename: `probe-name-${tag}.jpg`,
    exifArtist: `probe-artist-${tag}`,
    sessionUserId,
    sessionEmail: 'probe-session',
  }
}

describe('anonymous intake retention', () => {
  it('anonymous submission leaves no identifying data in database, logs, object storage, or backup', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      appOutput.push(String(chunk))
      return true
    })
    const caddy = await startCaddy(upstreamPort)
    try {
      const clientIp = await learnClientIp(caddy)
      const [user] = await handle.db.select().from(users).where(eq(users.id, sessionUserId))
      const markers = { ...markersFor(clientIp), sessionEmail: user?.email ?? '' }
      const report = await runRetentionProbe(depsFor(caddy), markers, signal)
      expect(report).toEqual({ passed: true, findings: [], submitStatus: 303 })
      await fetch(`${caddy.url}/favicon.ico`, { headers: { 'user-agent': markers.userAgent } })
      const logs = await caddy.logs()
      expect(logs).toContain(CONTROL_QUERY)
      expect(logs).not.toContain('/intake/anonymous')
      expect(logs).not.toContain('report-anonymously')
      expect(logs).not.toContain('/favicon.ico')
      expect(logs).not.toContain(markers.userAgent)
      expect(clientIp.length).toBeGreaterThan(3)
    } finally {
      stdout.mockRestore()
      await caddy.stop()
    }
  }, 240_000)

  it('without the log skip the probe fails on logs', async () => {
    const caddy = await startCaddy(upstreamPort, { withLogSkip: false })
    try {
      const clientIp = await learnClientIp(caddy)
      const report = await runRetentionProbe(depsFor(caddy), markersFor(clientIp), signal)
      expect(report.passed).toBe(false)
      expect(report.findings).toContainEqual({ location: 'logs', marker: 'clientIp' })
      expect(report.findings).toContainEqual({ location: 'logs', marker: 'userAgent' })
    } finally {
      await caddy.stop()
    }
  }, 240_000)

  it('the plain dump tool the backup leg relies on is installed', () => {
    expect(execFileSync('pg_dump', ['--version']).toString()).toContain('pg_dump')
  })
})
