import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { configVersions } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { Actor } from '@/features/auth/actor'
import type { ConfigKind } from '@/features/config/kinds'
import { publishConfig } from '@/features/config/publish'
import { saveDraft } from '@/features/config/store'

const signal = new AbortController().signal

export const FORM_BODY = {
  key: 'bp-form',
  label: 'Building permit form',
  fields: [
    {
      key: 'classification',
      label: 'Classification',
      type: 'select',
      required: true,
      fact: 'classification',
      options: [
        { value: 'residential', label: 'Residential' },
        { value: 'nonresidential', label: 'Nonresidential' },
      ],
    },
    { key: 'finished_sq_ft', label: 'Finished sq ft', type: 'decimal', required: false },
  ],
}

export const FEE_BODY = {
  key: 'bp-fees',
  lines: [
    {
      code: 'building',
      label: 'Building permit fee',
      due: 'at_approval',
      expr: {
        op: 'per_unit',
        source: { kind: 'field', field: 'finished_sq_ft' },
        centsPerUnit: 35,
      },
    },
  ],
}

export const CONDITIONS_BODY = {
  key: 'bp-conditions',
  conditions: [{ code: 'SEPTIC', text: 'Approved septic design on file', blocksIssuance: true }],
}

export const TEMPLATE_BODY = {
  key: 'bp-permit',
  label: 'Permit',
  kind: 'permit',
  body: 'Permit {{application.number}} for {{parcel.displayId}}',
}

export const MANDATORY_BP_BINDINGS = [
  'nh.bp.decision',
  'nh.bp.code_edition',
  'nh.bp.code_edition_recorded',
  'nh.bp.regional_impact',
  'nh.bp.regional_impact_comment',
  'nh.appeal.suspension',
  'town.bp.validity',
  'town.bp.expiration',
]

export function appTypeBody(overrides: Partial<ApplicationTypeBody> = {}): ApplicationTypeBody {
  return {
    key: 'BP',
    label: 'Building permit',
    prefix: 'BP',
    classification: 'nh.building_permit',
    formKey: 'bp-form',
    feeScheduleKey: 'bp-fees',
    conditionLibraryKey: 'bp-conditions',
    checklistKeys: [],
    templateKeys: ['bp-permit'],
    payTiming: 'at_approval',
    attestationText: 'I attest the information is true.',
    bindings: MANDATORY_BP_BINDINGS,
    workflow: { allowsDirectIssue: false, substeps: [], closesOn: 'certificate_of_occupancy' },
    ...overrides,
  }
}

export async function saveAndPublish(
  db: Db,
  actor: Actor,
  kind: ConfigKind,
  key: string,
  body: unknown,
): Promise<string> {
  const saved = await saveDraft(db, actor, { kind, key, body }, signal)
  if (!saved.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'fixture draft failed', { kind, key })
  const published = await publishConfig(db, actor, saved.value.versionId, signal)
  if (!published.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'fixture publish failed', {
      kind,
      key,
      error: JSON.stringify(published.error),
    })
  }
  return saved.value.versionId
}

export async function publishBuildingSupport(db: Db, actor: Actor): Promise<void> {
  await saveAndPublish(db, actor, 'form', 'bp-form', FORM_BODY)
  await saveAndPublish(db, actor, 'fee_schedule', 'bp-fees', FEE_BODY)
  await saveAndPublish(db, actor, 'condition_library', 'bp-conditions', CONDITIONS_BODY)
  await saveAndPublish(db, actor, 'template', 'bp-permit', TEMPLATE_BODY)
}

export async function insertPublishedDirect(
  db: Db,
  actor: Actor,
  input: { kind: ConfigKind; key: string; version: number; body: unknown },
): Promise<string> {
  const [row] = await db
    .insert(configVersions)
    .values({
      ...input,
      status: 'published',
      createdBy: actor.userId,
      publishedBy: actor.userId,
      publishedAt: new Date(),
    })
    .returning({ id: configVersions.id })
  return row?.id ?? ''
}

export async function statusOf(db: Db, id: string): Promise<string | undefined> {
  const [row] = await db.select().from(configVersions).where(eq(configVersions.id, id))
  return row?.status
}
