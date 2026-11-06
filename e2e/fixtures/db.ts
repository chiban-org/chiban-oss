import { Pool, type QueryResultRow } from 'pg'
import { E2E_DATABASE_URL } from './settings'

export interface E2eDb {
  rows<T extends QueryResultRow>(text: string, params?: readonly unknown[]): Promise<T[]>
  one<T extends QueryResultRow>(text: string, params?: readonly unknown[]): Promise<T>
  userIdFor(email: string): Promise<string>
  close(): Promise<void>
}

export function openReadOnlyDb(): E2eDb {
  const pool = new Pool({
    connectionString: E2E_DATABASE_URL,
    max: 2,
    options: '-c default_transaction_read_only=on',
  })
  const rows = async <T extends QueryResultRow>(text: string, params: readonly unknown[] = []) =>
    (await pool.query<T>(text, [...params])).rows
  const one = async <T extends QueryResultRow>(text: string, params: readonly unknown[] = []) => {
    const found = await rows<T>(text, params)
    if (found.length !== 1)
      throw new Error(`expected exactly one row, got ${found.length}: ${text}`)
    return found[0]!
  }
  return {
    rows,
    one,
    async userIdFor(email) {
      const row = await one<{ id: string }>('select id from users where email = $1', [email])
      return row.id
    },
    async close() {
      await pool.end()
    },
  }
}
