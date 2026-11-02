import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { inject } from 'vitest'
import type { Db } from '@/db/client'
import * as schema from '@/db/schema'
import type { TestPgConnection } from '../../vitest.globalSetup.ts'

const ADMIN_SHUTDOWN = '57P01'

export interface TestDb {
  db: Db
  pool: Pool
  url: string
  drop(): Promise<void>
}

function connectionUri(pg: TestPgConnection, database: string): string {
  const user = encodeURIComponent(pg.user)
  const password = encodeURIComponent(pg.password)
  return `postgres://${user}:${password}@${pg.host}:${pg.port}/${database}`
}

let adminPool: Pool | null = null
function getAdminPool(pg: TestPgConnection): Pool {
  adminPool ??= new Pool({
    host: pg.host,
    port: pg.port,
    user: pg.user,
    password: pg.password,
    database: pg.adminDatabase,
    max: 2,
  })
  return adminPool
}

export async function makeTestDb(): Promise<TestDb> {
  const pg = inject('testPg')
  const admin = getAdminPool(pg)
  const name = `t_${randomUUID().replaceAll('-', '')}`

  await admin.query(`CREATE DATABASE "${name}" TEMPLATE ${pg.template}`)

  const url = connectionUri(pg, name)
  const pool = new Pool({ connectionString: url, max: 4 })
  pool.on('error', (e: Error & { code?: string }) => {
    if (e.code !== ADMIN_SHUTDOWN) console.error(e)
  })
  const db = drizzle(pool, { schema })

  return {
    db,
    pool,
    url,
    drop: async () => {
      await pool.end()
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    },
  }
}
