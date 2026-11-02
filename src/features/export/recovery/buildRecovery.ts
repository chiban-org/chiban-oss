import { execFile } from 'node:child_process'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import { APP_VERSION } from '@/config/appVersion'
import { env } from '@/config/env'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { db } from '@/db/client'
import { getMigrationHead } from '@/db/migrationHead'
import { createTarSink } from '@/features/export/tarSink'

const run = promisify(execFile)
const MAX_DUMP_BYTES = 2 * 1024 * 1024 * 1024

export interface RecoveryDeps {
  pgDumpPath: string
  databaseUrl: string
  secretKeys: Record<string, string>
  activeKeyId: string
}

function connectionEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl)
  return {
    PATH: env.PATH,
    PGHOST: url.hostname,
    PGPORT: url.port === '' ? '5432' : url.port,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.slice(1),
  } as unknown as NodeJS.ProcessEnv
}

async function dumpDatabase(deps: RecoveryDeps, signal: AbortSignal): Promise<Buffer> {
  try {
    const { stdout } = await run(
      deps.pgDumpPath,
      ['--format=custom', '--no-owner', '--no-privileges'],
      {
        env: connectionEnv(deps.databaseUrl),
        encoding: 'buffer',
        maxBuffer: MAX_DUMP_BYTES,
        signal,
      },
    )
    return stdout
  } catch (e) {
    throw new AppError(ErrorIds.EXPORT_DUMP_FAILED, 'database dump failed', {
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}

async function* entries(deps: RecoveryDeps, signal: AbortSignal) {
  const dump = await dumpDatabase(deps, signal)
  const head = await getMigrationHead(db, signal)
  yield { name: 'database.dump', bytes: dump }
  yield {
    name: 'secrets.json',
    bytes: Buffer.from(
      JSON.stringify({
        CHIBAN_SECRET_KEYS: JSON.stringify(deps.secretKeys),
        CHIBAN_ACTIVE_KEY_ID: deps.activeKeyId,
      }),
    ),
  }
  yield {
    name: 'recovery-manifest.json',
    bytes: Buffer.from(
      JSON.stringify({
        appVersion: APP_VERSION,
        migrationHead: head,
        createdAt: new Date().toISOString(),
      }),
    ),
  }
}

export function buildRecoveryStream(deps: RecoveryDeps, signal: AbortSignal): Readable {
  const tar = createTarSink()
  void (async () => {
    try {
      for await (const entry of entries(deps, signal)) {
        await tar.sink.write({
          path: entry.name,
          size: entry.bytes.length,
          body: Readable.from([entry.bytes]),
        })
      }
      tar.finish()
    } catch (e) {
      tar.stream.destroy(e instanceof Error ? e : new Error(String(e)))
    }
  })()
  return tar.stream
}
