import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import type { TestProject } from 'vitest/node'
import { POSTGIS_IMAGE, TEMPLATE_DB } from './src/constants/infra.ts'
import { type ObjectStoreTestConfig, startObjectStore } from './src/test/objectStoreContainer.ts'

const MIGRATIONS_FOLDER = fileURLToPath(new URL('./drizzle', import.meta.url))
const MIGRATIONS_JOURNAL = fileURLToPath(new URL('./drizzle/meta/_journal.json', import.meta.url))

export interface TestPgConnection {
  host: string
  port: number
  user: string
  password: string
  adminDatabase: string
  template: string
}

declare module 'vitest' {
  interface ProvidedContext {
    testPg: TestPgConnection
    testObjectStore: ObjectStoreTestConfig
  }
}

let container: StartedPostgreSqlContainer | undefined
let objectStore: Awaited<ReturnType<typeof startObjectStore>> | undefined

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const objectStoreStarting = startObjectStore()
  container = await new PostgreSqlContainer(POSTGIS_IMAGE)
    .withCommand([
      'postgres',
      '-c',
      'max_connections=300',
      '-c',
      'fsync=off',
      '-c',
      'full_page_writes=off',
    ])
    .start()

  const adminDatabase = container.getDatabase()
  const base = {
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getPassword(),
  }

  const adminPool = new Pool({ ...base, database: adminDatabase, max: 2 })
  await adminPool.query(`CREATE DATABASE ${TEMPLATE_DB}`)
  await adminPool.end()

  const templatePool = new Pool({ ...base, database: TEMPLATE_DB, max: 2 })
  const templateDb = drizzle(templatePool)
  await templateDb.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis`)
  await templateDb.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`)
  await templateDb.execute(sql`CREATE EXTENSION IF NOT EXISTS citext`)
  if (existsSync(MIGRATIONS_JOURNAL)) {
    await migrate(templateDb, { migrationsFolder: MIGRATIONS_FOLDER })
  }
  await templatePool.end()

  objectStore = await objectStoreStarting
  project.provide('testPg', { ...base, adminDatabase, template: TEMPLATE_DB })
  project.provide('testObjectStore', objectStore.config)

  return async () => {
    await container?.stop()
    await objectStore?.stop()
  }
}
