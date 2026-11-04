import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { type agendaItems, hearings } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { HEARING_KIND_LABELS } from '@/features/hearings/labels'
import { loadPermitData } from '@/features/permits/permitData'
import type { AgendaModelItem } from './agendaPdf'

type ItemRow = typeof agendaItems.$inferSelect

export async function hearingTitle(
  tx: Tx,
  applicationId: string,
  kind: keyof typeof HEARING_KIND_LABELS,
  signal: AbortSignal,
) {
  const app = await loadApplicationContext(tx, applicationId, signal)
  return `${HEARING_KIND_LABELS[kind]}: ${app?.typeBody.label ?? 'Application'} ${app?.number ?? ''}`.trim()
}

export async function modelItems(
  tx: Tx,
  items: ItemRow[],
  signal: AbortSignal,
): Promise<AgendaModelItem[]> {
  const out: AgendaModelItem[] = []
  for (const item of items) {
    const [hearing] =
      item.hearingId === null
        ? []
        : await tx.select().from(hearings).where(eq(hearings.id, item.hearingId))
    const data =
      hearing === undefined ? null : await loadPermitData(tx, hearing.applicationId, signal)
    out.push({
      position: item.position,
      kind: item.kind,
      title: item.title,
      description: item.description,
      application:
        data === null
          ? null
          : {
              number: data.application.number,
              applicantName: data.applicantName,
              parcelDisplayId: data.parcelDisplayId,
              siteAddress: data.siteAddress,
            },
    })
  }
  return out
}
