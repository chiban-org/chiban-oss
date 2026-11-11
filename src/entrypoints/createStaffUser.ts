import { db, pool } from '@/db/client'
import { getMailTransport } from '@/features/mail/transport'
import { BOOTSTRAP_USAGE, parseBootstrapArgs } from '@/features/users/bootstrapArgs'
import { bootstrapStaff } from '@/features/users/bootstrapStaff'

const MAIL_TIMEOUT_MS = 60_000

const args = parseBootstrapArgs(process.argv.slice(2))
if (args === null) {
  console.error(BOOTSTRAP_USAGE)
  process.exit(1)
}

const result = await bootstrapStaff(
  db,
  { email: args.email, displayName: args.name, role: args.role },
  {
    now: new Date(),
    signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
    ...(args['send-email'] ? { mail: getMailTransport() } : {}),
  },
)
await pool.end()
if (!result.ok) {
  console.error(`could not create the account: ${result.error}`)
  process.exit(1)
}
console.warn(`created ${args.email} as ${args.role}`)
if (result.value.emailSent === true) console.warn('the invite email was sent')
if (result.value.emailSent === false) console.warn('the invite email could not be sent')
console.warn('open this link within 7 days to choose a password (it works once):')
console.warn(result.value.setPasswordUrl)
