import { and, asc, eq } from 'drizzle-orm'
import type { ChecklistItem } from '@/components/notices/NoticeChecklist'
import type { Db } from '@/db/client'
import {
  applicationMunicipalities,
  documents,
  noticeSets,
  sourceWaterDeterminations,
} from '@/db/schema'
import { currentIssuedList } from '@/features/abutters/queries'
import { getRegionalContacts } from '@/features/boards/regionalContacts'
import { checklistFor } from '@/features/decisions/decisionView'
import { evidenceOf } from '@/features/documents/evidence'
import { RECEIPT_SUBJECT } from '@/features/notices/receiptNotices'
import { hasReceiptNotices } from '@/features/notices/requirementsFor'
import type { ProceedingClassification } from '@/features/packs/schema'

export interface ReceiptPanel {
  applicationId: string
  canPrepare: boolean
  prepared: boolean
  checklist: ChecklistItem[]
  itemChoices: { id: string; label: string }[]
  proofChoices: { id: string; label: string }[]
  canDetermine: boolean
  sourceWater: {
    text: string
    determination: 'within' | 'not_within' | ''
    supplierKey: string
    suppliers: { key: string; name: string }[]
  }
  municipalities: {
    text: string
    options: { key: string; name: string }[]
    abutting: string[]
    included: string[]
  }
}

function sourceWaterText(
  row: { determination: 'within' | 'not_within'; supplierKey: string | null } | undefined,
  supplierName: string | null,
): string {
  if (row === undefined)
    return 'The source water protection area determination has not been recorded.'
  if (row.determination === 'not_within')
    return 'The project is not within a source water protection area.'
  return `The project is within a source water protection area. Supplier: ${supplierName ?? row.supplierKey ?? 'not named'}.`
}

export async function loadReceiptPanel(
  db: Db,
  input: {
    applicationId: string
    classification: ProceedingClassification | undefined
    canRecord: boolean
    canManage: boolean
  },
  signal: AbortSignal,
): Promise<ReceiptPanel | null> {
  const { applicationId, classification } = input
  if (classification === undefined || !hasReceiptNotices(classification)) return null
  const contacts = await getRegionalContacts(db, signal)
  const [water] = await db
    .select()
    .from(sourceWaterDeterminations)
    .where(eq(sourceWaterDeterminations.applicationId, applicationId))
  const listed = await db
    .select()
    .from(applicationMunicipalities)
    .where(eq(applicationMunicipalities.applicationId, applicationId))
    .orderBy(asc(applicationMunicipalities.municipalityKey))
  const [set] = await db
    .select({ id: noticeSets.id })
    .from(noticeSets)
    .where(
      and(eq(noticeSets.subjectKind, RECEIPT_SUBJECT), eq(noticeSets.subjectId, applicationId)),
    )
  const checklist = set === undefined ? [] : await checklistFor(db, set.id, signal)
  const docs = await db
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .where(evidenceOf(applicationId))
    .orderBy(asc(documents.seq))
  const issued = (await currentIssuedList(db, applicationId, signal)) !== null
  const nameOf = (key: string) => contacts.municipalities.find((m) => m.key === key)?.name ?? key
  return {
    applicationId,
    canPrepare: input.canRecord && issued && set === undefined,
    prepared: set !== undefined,
    checklist,
    itemChoices: checklist.map((i) => ({ id: i.itemId, label: i.recipientName ?? i.channel })),
    proofChoices: docs.map((d) => ({ id: d.id, label: d.title })),
    canDetermine: input.canManage,
    sourceWater: {
      text: sourceWaterText(
        water,
        contacts.waterSuppliers.find((s) => s.key === water?.supplierKey)?.name ?? null,
      ),
      determination: water?.determination ?? '',
      supplierKey: water?.supplierKey ?? '',
      suppliers: contacts.waterSuppliers.map((s) => ({ key: s.key, name: s.name })),
    },
    municipalities: {
      text:
        listed.length === 0
          ? 'No abutting or included municipalities are recorded.'
          : `Recorded: ${listed.map((m) => `${nameOf(m.municipalityKey)} (${m.relation === 'includes' ? 'included' : 'abutting'})`).join(', ')}.`,
      options: contacts.municipalities.map((m) => ({ key: m.key, name: m.name })),
      abutting: listed.filter((m) => m.relation === 'abutting').map((m) => m.municipalityKey),
      included: listed.filter((m) => m.relation === 'includes').map((m) => m.municipalityKey),
    },
  }
}
