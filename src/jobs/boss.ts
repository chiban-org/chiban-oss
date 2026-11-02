import type { PgBoss } from 'pg-boss'

const KEY = Symbol.for('chiban.jobs.boss')

type BossGlobal = { [KEY]?: PgBoss | null }

export function setBoss(boss: PgBoss): void {
  ;(globalThis as BossGlobal)[KEY] = boss
}

export function clearBoss(): void {
  ;(globalThis as BossGlobal)[KEY] = null
}

export function getBoss(): PgBoss | null {
  return (globalThis as BossGlobal)[KEY] ?? null
}
