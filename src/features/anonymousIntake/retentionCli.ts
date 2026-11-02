import { parseArgs } from 'node:util'
import { z } from 'zod'
import { err, ok, type Result } from '@/types/result'

export const VERIFY_CLI_USAGE =
  'usage: anonymous-intake-verify submit | check --markers <file> --client-ip <ip> --logs <file> --backup-dir <folder> --caddyfile-sha256 <hex>'

export type VerifyCliArgs =
  | { phase: 'submit' }
  | {
      phase: 'check'
      markers: string
      clientIp: string
      logs: string
      backupDir: string
      caddyfileSha256: string
    }

const CheckSchema = z.object({
  markers: z.string().min(1),
  'client-ip': z.string().min(1),
  logs: z.string().min(1),
  'backup-dir': z.string().min(1),
  'caddyfile-sha256': z.string().regex(/^[0-9a-f]{64}$/),
})

export function parseVerifyCliArgs(argv: string[]): Result<VerifyCliArgs, string> {
  const [phase, ...rest] = argv
  if (phase === 'submit' && rest.length === 0) return ok({ phase: 'submit' })
  if (phase !== 'check') return err(VERIFY_CLI_USAGE)
  try {
    const { values } = parseArgs({
      args: rest,
      strict: true,
      allowPositionals: false,
      options: {
        markers: { type: 'string' },
        'client-ip': { type: 'string' },
        logs: { type: 'string' },
        'backup-dir': { type: 'string' },
        'caddyfile-sha256': { type: 'string' },
      },
    })
    const parsed = CheckSchema.safeParse(values)
    if (!parsed.success) return err(VERIFY_CLI_USAGE)
    return ok({
      phase: 'check',
      markers: parsed.data.markers,
      clientIp: parsed.data['client-ip'],
      logs: parsed.data.logs,
      backupDir: parsed.data['backup-dir'],
      caddyfileSha256: parsed.data['caddyfile-sha256'],
    })
  } catch {
    return err(VERIFY_CLI_USAGE)
  }
}
