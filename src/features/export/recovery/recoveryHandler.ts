import { Readable } from 'node:stream'
import { db } from '@/db/client'
import { verifyStepUp } from '@/features/auth/stepUp'
import { hasCapability } from '@/features/authz/capabilities'
import { buildRecoveryStream, type RecoveryDeps } from '@/features/export/recovery/buildRecovery'
import { encryptStream } from '@/features/export/recovery/envelope'
import { guardAction } from '@/server/actionGuard'
import { todayInTimeZone } from '@/types/civilDate'

const REQUEST_TIMEOUT_MS = 10 * 60 * 1000
const MIN_PASSPHRASE = 16

const refuse = (status: number, error: string): Response =>
  Response.json({ error }, { status, headers: { 'cache-control': 'private, no-store' } })

function field(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value : ''
}

export async function handleRecoveryRequest(
  request: Request,
  deps: RecoveryDeps,
): Promise<Response> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const form = await request.formData()
  const guard = await guardAction(form, signal, { exempt: 'export' })
  if (!guard.ok) return refuse(403, guard.error)
  const actor = guard.value
  if (actor?.kind !== 'staff' || !actor.roles.includes('admin')) return refuse(403, 'forbidden')
  if (!(await hasCapability(db, actor.userId, 'export.recovery', signal))) {
    return refuse(403, 'forbidden')
  }
  const passphrase = field(form, 'passphrase')
  if (passphrase.length < MIN_PASSPHRASE) return refuse(422, 'passphrase_too_short')
  const verified = await verifyStepUp(
    db,
    actor,
    { password: field(form, 'password'), totp: field(form, 'totp') },
    signal,
  )
  if (!verified.ok) return refuse(verified.error === 'rate_limited' ? 429 : 401, verified.error)
  const tar = buildRecoveryStream(deps, signal)
  const day = todayInTimeZone('UTC', new Date())
  return new Response(Readable.toWeb(encryptStream(tar, passphrase)) as ReadableStream, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="chiban-recovery-${day}.bin"`,
      'cache-control': 'private, no-store',
    },
  })
}
