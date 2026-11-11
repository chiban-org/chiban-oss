import { parseArgs } from 'node:util'
import { z } from 'zod'
import { STAFF_ROLES } from '@/constants/roles'

const argsSchema = z.object({
  email: z.string().trim().min(3),
  name: z.string().trim().min(1),
  role: z.enum(STAFF_ROLES as [string, ...string[]]),
  'send-email': z.boolean().default(false),
})

export type BootstrapArgs = z.infer<typeof argsSchema>

export const BOOTSTRAP_USAGE = `usage: create-staff-user --email <email> --name <name> --role <role> [--send-email]
roles: ${STAFF_ROLES.join(', ')}`

export function parseBootstrapArgs(argv: readonly string[]): BootstrapArgs | null {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: {
        email: { type: 'string' },
        name: { type: 'string' },
        role: { type: 'string' },
        'send-email': { type: 'boolean' },
      },
      strict: true,
    })
    const parsed = argsSchema.safeParse(values)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
