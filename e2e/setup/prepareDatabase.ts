import { Client } from 'pg'
import { hashPassword } from '@/features/auth/password'
import { STAFF_DEMO_EMAILS } from '../fixtures/roles'
import {
  E2E_DATABASE_NAME,
  E2E_DATABASE_URL,
  E2E_MAINTENANCE_DATABASE_URL,
  E2E_STAFF_PASSWORD,
} from '../fixtures/settings'
import { runStep } from './runStep'

async function withClient(url: string, fn: (client: Client) => Promise<void>): Promise<void> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await fn(client)
  } finally {
    await client.end()
  }
}

async function ensureDatabase(): Promise<void> {
  await withClient(E2E_MAINTENANCE_DATABASE_URL, async (client) => {
    const found = await client.query('select 1 from pg_database where datname = $1', [
      E2E_DATABASE_NAME,
    ])
    if (found.rowCount === 0) await client.query(`create database "${E2E_DATABASE_NAME}"`)
  })
}

async function setStaffPasswords(): Promise<void> {
  const passwordHash = await hashPassword(E2E_STAFF_PASSWORD, AbortSignal.timeout(30_000))
  await withClient(E2E_DATABASE_URL, async (client) => {
    const updated = await client.query(
      "update users set password_hash = $1 where kind = 'staff' and email = any($2)",
      [passwordHash, STAFF_DEMO_EMAILS],
    )
    if (updated.rowCount !== STAFF_DEMO_EMAILS.length) {
      throw new Error(
        `set ${updated.rowCount} staff passwords, expected ${STAFF_DEMO_EMAILS.length}`,
      )
    }
  })
}

export async function prepareDatabase(): Promise<void> {
  await ensureDatabase()
  await runStep('pnpm', ['storage:init'])
  await runStep('pnpm', ['db:reset:demo'])
  await setStaffPasswords()
}
