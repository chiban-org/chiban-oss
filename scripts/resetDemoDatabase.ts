import { sql } from 'drizzle-orm'
import { db, pool } from '@/db/client'
import { isDevSignInEnabled } from '@/features/auth/devSignIn'

if (!isDevSignInEnabled()) {
  console.error(
    'refusing to reset: this only runs on a development database with ENABLE_DEV_SIGN_IN=true',
  )
  await pool.end()
  process.exit(1)
}
await db.execute(sql`drop schema if exists drizzle cascade`)
await db.execute(sql`drop schema if exists public cascade`)
await db.execute(sql`create schema public`)
await pool.end()
console.warn('database emptied; run migrations and the demo seed next')
