import { parseArgs } from 'node:util'
import { z } from 'zod'
import { ROLES } from '@/constants/roles'
import { db, pool } from '@/db/client'
import { createStaffUserWithDefaults } from '@/features/auth/createStaffUserWithDefaults'

const argsSchema = z.object({
  email: z.string().min(3),
  name: z.string().min(1),
  role: z.enum(ROLES),
  password: z.string().min(1),
})

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string' },
    password: { type: 'string' },
  },
})

const parsed = argsSchema.safeParse(values)
if (!parsed.success) {
  console.error('usage: pnpm staff:create --email <e> --name <n> --role <role> --password <p>')
  process.exit(1)
}

const result = await createStaffUserWithDefaults(
  db,
  {
    email: parsed.data.email,
    displayName: parsed.data.name,
    role: parsed.data.role,
    password: parsed.data.password,
  },
  new Date(),
  AbortSignal.timeout(60_000),
)
await pool.end()
if (!result.ok) {
  console.error(`could not create user: ${result.error}`)
  process.exit(1)
}
console.warn(`created ${result.value.userId}`)
