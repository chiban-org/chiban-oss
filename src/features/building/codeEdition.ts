import type { CodeEditionEntry, RecordRule } from '@packs/nh/schema'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { codeEditionRecords } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { amendmentsInForce } from '@/features/config/bindings'
import { loadPack } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface ResolvedEdition {
  editionKey: string
  label: string
  status: CodeEditionEntry['status']
  elected: boolean
}

export type EditionError = 'no_edition_for_date' | 'election_not_allowed'

function summarize(entry: CodeEditionEntry, elected: boolean): ResolvedEdition {
  return { editionKey: entry.key, label: entry.label, status: entry.status, elected }
}

export function resolveCodeEdition(
  table: CodeEditionEntry[],
  receiptDate: CivilDate,
  election?: string,
): Result<ResolvedEdition, EditionError> {
  const governing = [...table]
    .filter((e) => e.effectiveFrom <= receiptDate)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0]
  if (governing === undefined) return err('no_edition_for_date')
  if (election === undefined || election === governing.key) return ok(summarize(governing, false))
  const window = governing.electionWindow
  const elected = table.find((e) => e.key === election)
  if (window === null || elected === undefined) return err('election_not_allowed')
  if (receiptDate > window.until || !window.mayElect.includes(election)) {
    return err('election_not_allowed')
  }
  return ok(summarize(elected, true))
}

export async function recordCodeEdition(
  db: Db,
  actor: Actor,
  input: { applicationId: string; election?: string },
  signal: AbortSignal,
): Promise<
  Result<{ editionKey: string }, 'forbidden' | 'not_found' | 'not_submitted' | EditionError>
> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'permit.issue', signal))) return err('forbidden')
  const app = await loadApplicationContext(db, input.applicationId, signal)
  if (app === null) return err('not_found')
  if (app.receivedDate === null) return err('not_submitted')
  const resolved = resolveCodeEdition(loadPack().codeEditions, app.receivedDate, input.election)
  if (!resolved.ok) return err(resolved.error)
  return await transactionResult(db, async (tx) => {
    const amendments = await amendmentsInForce(tx, app.receivedDate as CivilDate, signal)
    const values = {
      applicationId: app.id,
      receiptDate: app.receivedDate as CivilDate,
      completedDate: app.completedDate,
      classification: app.facts.classification,
      dwellingUnits: app.facts.dwellingUnits,
      editionKey: resolved.value.editionKey,
      editionLabel: resolved.value.label,
      editionStatus: resolved.value.status,
      applicantElection: resolved.value.elected ? resolved.value.editionKey : null,
      localAmendmentsInForce: amendments.map((a) => ({
        key: a.key,
        title: a.title,
        codeSection: a.codeSection,
      })),
      recordedBy: actor.userId,
      recordedAt: new Date(),
    }
    await tx
      .insert(codeEditionRecords)
      .values(values)
      .onConflictDoUpdate({ target: codeEditionRecords.applicationId, set: values })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'building.code_edition.record',
        entityType: 'application',
        entityId: app.id,
        after: { editionKey: resolved.value.editionKey, elected: resolved.value.elected },
      },
      signal,
    )
    return ok({ editionKey: resolved.value.editionKey })
  })
}

export async function getCodeEditionRecord(db: Db, applicationId: string) {
  const [row] = await db
    .select()
    .from(codeEditionRecords)
    .where(eq(codeEditionRecords.applicationId, applicationId))
  return row ?? null
}

export interface EditionDescription {
  label: string
  status: CodeEditionEntry['status']
  components: string[]
  enforcementFrom: CivilDate | null
  amendmentPackagesInForce: string[]
  citation: CodeEditionEntry['citation']
}

export function describeCodeEdition(
  entry: CodeEditionEntry,
  receiptDate: CivilDate,
): EditionDescription {
  return {
    label: entry.label,
    status: entry.status,
    components: entry.components.map((c) => `${c.code} ${c.edition}`),
    enforcementFrom: entry.enforcementFrom,
    amendmentPackagesInForce: entry.amendmentPackages
      .filter((p) => p.effectiveFrom <= receiptDate)
      .map((p) => p.label),
    citation: entry.citation,
  }
}

export function codeEditionPanelRows(
  rule: RecordRule,
  record: Record<string, unknown>,
): { field: string; value: string }[] {
  return rule.fields.map((field) => {
    const value = record[field]
    const text =
      value === null || value === undefined || value === '' ? 'Not recorded' : String(value)
    return { field, value: text }
  })
}
