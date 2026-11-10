import { ne } from 'drizzle-orm'
import { env } from '@/config/env'
import type { DbOrTx } from '@/db/client'
import { processorAccounts } from '@/db/schema'

const UNDEFINED_TABLE = '42P01'
const STARTUP_CHECK_MS = 30_000

function isUndefinedTable(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const cause = 'cause' in e ? e.cause : null
  const code = (value: unknown) =>
    typeof value === 'object' && value !== null && 'code' in value ? value.code : null
  return code(e) === UNDEFINED_TABLE || code(cause) === UNDEFINED_TABLE
}

export async function unsafeDemoProcessors(db: DbOrTx, signal: AbortSignal): Promise<string[]> {
  signal.throwIfAborted()
  try {
    const rows = await db
      .select({
        processor: processorAccounts.processor,
        mode: processorAccounts.mode,
        accountRef: processorAccounts.accountRef,
      })
      .from(processorAccounts)
      .where(ne(processorAccounts.processor, 'simulated'))
      .orderBy(processorAccounts.createdAt)
    return rows.map((r) => `${r.processor} ${r.mode} ${r.accountRef}`)
  } catch (e) {
    if (isUndefinedTable(e)) return []
    throw e
  }
}

export interface DemoStartupDeps {
  db: DbOrTx
  demoMode: boolean
  signal: AbortSignal
  report: (line: string) => void
}

export async function demoStartupProblem(deps: DemoStartupDeps): Promise<string | null> {
  if (!deps.demoMode) return null
  const unsafe = await unsafeDemoProcessors(deps.db, deps.signal)
  if (unsafe.length === 0) return null
  const problem = `[demo] refusing to start: CHIBAN_DEMO_MODE is on and a payment processor other than the simulator is configured (${unsafe.join(', ')})`
  deps.report(problem)
  return problem
}

export async function exitIfUnsafeDemo(db: DbOrTx): Promise<void> {
  const problem = await demoStartupProblem({
    db,
    demoMode: env.CHIBAN_DEMO_MODE,
    signal: AbortSignal.timeout(STARTUP_CHECK_MS),
    report: (line) => console.error(line),
  })
  if (problem !== null) process.exit(1)
}
