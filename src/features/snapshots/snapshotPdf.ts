import { displayFieldValue } from '@/features/forms/displayValue'
import type { DocumentFrame } from '@/features/pdf/frame'
import { type PdfBlock, renderPdf } from '@/features/pdf/renderPdf'
import { partyRoleLabel } from '@/features/projects/partyRoleLabels'
import type { PublicSnapshotView } from '@/features/snapshots/publicView'
import { formatInstantDate } from '@/lib/formatDate'

interface PdfParty {
  role: string
  name: string
  email?: string | null
}

type SnapshotPdfInput = Omit<PublicSnapshotView, 'parties'> & {
  parties: PdfParty[]
  attestation?: { statementSha256: string; attestedAt: string } | null
}

function fieldRows(body: SnapshotPdfInput): { label: string; value: string }[] {
  return body.form.fields.flatMap((field) => {
    const value = body.values[field.key]
    return value === undefined || value === ''
      ? []
      : [{ label: field.label, value: displayFieldValue(field, value) }]
  })
}

function blocks(body: SnapshotPdfInput, timeZone: string): PdfBlock[] {
  const out: PdfBlock[] = [
    { kind: 'heading', text: body.form.label },
    { kind: 'fields', rows: fieldRows(body) },
  ]
  if (body.parties.length > 0) {
    out.push({
      kind: 'table',
      columns: ['Role', 'Name', 'Email'],
      rows: body.parties.map((p) => [partyRoleLabel(p.role), p.name, p.email ?? '']),
    })
  }
  if (body.attachments.length > 0) {
    out.push({
      kind: 'table',
      columns: ['Attachment', 'SHA-256'],
      rows: body.attachments.map((a) => [a.filename, a.sha256]),
    })
  }
  if (body.attestation) {
    out.push({
      kind: 'notice',
      text: `Attested on ${formatInstantDate(new Date(body.attestation.attestedAt), timeZone)}. Statement hash ${body.attestation.statementSha256}.`,
    })
  }
  return out
}

export async function renderSnapshotPdf(
  body: SnapshotPdfInput,
  frame: DocumentFrame,
  sequence: number,
  timeZone: string,
): Promise<Uint8Array> {
  return await renderPdf({
    title: `Application ${body.applicationNumber}`,
    subtitle: `Snapshot ${sequence}`,
    frame,
    scale: 'document',
    blocks: blocks(body, timeZone),
  })
}
