import { NH_RULE_TRANSITIONS } from '@packs/nh/transitions'
import type { Db } from '@/db/client'
import {
  applyRuleTransition,
  previewRuleTransition,
  type RuleTransition,
} from '@/features/packs/ruleTransitions'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

export type RulesMigrateMode = 'preview' | 'apply'

const SYSTEM_ACTOR = { kind: 'system', job: 'rules:migrate' } as const

export function parseRulesMigrateArgs(args: string[]): Result<RulesMigrateMode, string> {
  const modes = args.filter((a) => a === '--preview' || a === '--apply')
  const unknown = args.filter((a) => a !== '--preview' && a !== '--apply')
  if (unknown.length > 0) return err(`Unknown argument ${unknown.join(' ')}`)
  if (modes.length !== 1) return err('Pass exactly one of --preview or --apply')
  return ok(modes[0] === '--apply' ? 'apply' : 'preview')
}

export async function runRulesMigrate(
  db: Db,
  mode: RulesMigrateMode,
  transitions: RuleTransition[],
  print: (line: string) => void,
  signal: AbortSignal,
): Promise<void> {
  if (transitions.length === 0) {
    print('No rule transitions are declared.')
    return
  }
  const today = await townToday(db, new Date(), signal)
  for (const t of transitions) {
    if (mode === 'preview') {
      const preview = await previewRuleTransition(db, t, today, signal)
      print(`${t.id}: ${preview.affected.length} running clocks affected (${t.policy})`)
      for (const row of preview.affected) {
        print(`  ${row.applicationId} ${row.oldDue} -> ${row.newDue ?? 'unchanged'}`)
      }
      continue
    }
    const result = await applyRuleTransition(db, SYSTEM_ACTOR, t, signal)
    print(
      result.ok
        ? `${t.id}: applied, ${result.value.affected} affected`
        : `${t.id}: already applied`,
    )
  }
}

export async function rulesMigrateMain(db: Db, args: string[]): Promise<number> {
  const mode = parseRulesMigrateArgs(args)
  if (!mode.ok) {
    process.stderr.write(`${mode.error}\n`)
    return 1
  }
  await runRulesMigrate(
    db,
    mode.value,
    NH_RULE_TRANSITIONS,
    (l) => process.stdout.write(`${l}\n`),
    AbortSignal.timeout(60_000),
  )
  return 0
}
