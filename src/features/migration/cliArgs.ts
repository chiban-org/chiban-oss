import { parseArgs } from 'node:util'
import { z } from 'zod'
import type { ScanInput } from '@/features/migration/types'
import { err, ok, type Result } from '@/types/result'

export type LegacyDocsCommand =
  | { command: 'scan'; as: string; scan: ScanInput }
  | { command: 'run' | 'report'; as: string; batchId: string }

const scanShape = z.object({
  as: z.string().min(1),
  root: z.string().min(1),
  name: z.string().min(1),
  series: z.string().min(1),
  pattern: z.string().min(1),
  'id-format': z.string().min(1),
})

const batchShape = z.object({ as: z.string().min(1), batch: z.uuid() })

export const LEGACY_DOCS_USAGE = [
  'usage:',
  '  legacy-docs scan --as <staff email> --root <dir> --name <label> --series <series key> --pattern <regex with named groups> --id-format <format key>',
  '  legacy-docs run --as <staff email> --batch <batch id>',
  '  legacy-docs report --as <staff email> --batch <batch id>',
].join('\n')

const OPTIONS = {
  as: { type: 'string' },
  root: { type: 'string' },
  name: { type: 'string' },
  series: { type: 'string' },
  pattern: { type: 'string' },
  'id-format': { type: 'string' },
  batch: { type: 'string' },
} as const

export function parseLegacyDocsArgs(argv: string[]): Result<LegacyDocsCommand, 'usage'> {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true })
  } catch {
    return err('usage')
  }
  const command = parsed.positionals[0]
  if (command === 'scan') {
    const shape = scanShape.safeParse(parsed.values)
    if (!shape.success) return err('usage')
    const v = shape.data
    return ok({
      command,
      as: v.as,
      scan: {
        root: v.root,
        name: v.name,
        seriesKey: v.series,
        folderPattern: v.pattern,
        idFormat: v['id-format'],
      },
    })
  }
  if (command === 'run' || command === 'report') {
    const shape = batchShape.safeParse(parsed.values)
    if (!shape.success) return err('usage')
    return ok({ command, as: shape.data.as, batchId: shape.data.batch })
  }
  return err('usage')
}
