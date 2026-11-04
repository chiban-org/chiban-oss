import type { Board } from '@packs/nh/boardSchema'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { documentFrame } from '@/features/pdf/documentFrame'
import { renderPdf } from '@/features/pdf/renderPdf'
import type { ObjectStore } from '@/features/storage/objectStore'
import type { SignerRole } from '@/features/town/profileSchema'
import { err, ok, type Result } from '@/types/result'

const SAMPLE_SIGNER: SignerRole = 'land_use_administrator'

export async function buildSampleLetterPdf(
  db: Db,
  actor: Actor,
  scope: { board?: Board; store?: ObjectStore },
  signal: AbortSignal,
): Promise<Result<Uint8Array, 'forbidden'>> {
  if (!(await hasCapability(db, actor.userId, 'config.edit', signal))) return err('forbidden')
  const frame = await documentFrame(db, { board: scope.board ?? null }, signal, scope.store)
  const role = frame.signers.find((s) => s.role === SAMPLE_SIGNER)?.role ?? frame.signers[0]?.role
  return ok(
    await renderPdf({
      title: 'Sample letter',
      subtitle: 'How documents from the town will look',
      frame,
      scale: 'document',
      blocks: [
        {
          kind: 'paragraph',
          text: 'This page shows the town letterhead, the footer and a signature block as they appear on permits, notices, decisions and letters. The wording of each document comes from its own template.',
        },
        {
          kind: 'fields',
          rows: [
            { label: 'Application', value: 'BP-2027-0001' },
            { label: 'Parcel address', value: '14 Pond Road' },
          ],
        },
        { kind: 'signature', role: role ?? SAMPLE_SIGNER, label: 'Signature' },
      ],
    }),
  )
}
