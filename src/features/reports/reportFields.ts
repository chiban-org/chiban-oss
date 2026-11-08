import { and, asc, eq, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { configVersions } from '@/db/schema'
import {
  type ApplicationTypeBody,
  ApplicationTypeBodySchema,
} from '@/features/applications/applicationTypeSchema'
import { getPublished } from '@/features/config/store'
import {
  FormBodySchema,
  type FormField,
  isNumberType,
  questionsOf,
} from '@/features/forms/formSchema'
import type { ReportRange } from '@/features/reports/range'

export type ReportFieldType = 'integer' | 'decimal' | 'money'

export interface ReportFieldColumn {
  key: string
  label: string
  type: ReportFieldType
}

export interface ReportFieldConfig {
  columns: ReportFieldColumn[]
  byType: Map<string, string[]>
}

export type FieldSums = Record<string, number>

export function reportableFields(fields: readonly FormField[]): ReportFieldColumn[] {
  return questionsOf(fields)
    .filter((f) => isNumberType(f.type))
    .map((f) => ({ key: f.key, label: f.label, type: f.type as ReportFieldType }))
}

async function publishedTypes(db: DbOrTx, signal: AbortSignal): Promise<ApplicationTypeBody[]> {
  signal.throwIfAborted()
  const rows = await db
    .select({ body: configVersions.body })
    .from(configVersions)
    .where(and(eq(configVersions.kind, 'application_type'), eq(configVersions.status, 'published')))
    .orderBy(asc(configVersions.key))
  return rows.flatMap((r) => {
    const parsed = ApplicationTypeBodySchema.safeParse(r.body)
    return parsed.success ? [parsed.data] : []
  })
}

export async function formFieldsFor(
  db: DbOrTx,
  formKey: string,
  signal: AbortSignal,
): Promise<ReportFieldColumn[]> {
  const form = await getPublished(db, 'form', formKey, signal)
  const parsed = FormBodySchema.safeParse(form?.body)
  return parsed.success ? reportableFields(parsed.data.fields) : []
}

export async function loadReportFields(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<ReportFieldConfig> {
  const columns = new Map<string, ReportFieldColumn>()
  const byType = new Map<string, string[]>()
  for (const type of await publishedTypes(db, signal)) {
    const chosen = new Set(type.reportFields ?? [])
    if (chosen.size === 0) continue
    const offered = (await formFieldsFor(db, type.formKey, signal)).filter((f) => chosen.has(f.key))
    if (offered.length === 0) continue
    byType.set(
      type.key,
      offered.map((f) => f.key),
    )
    for (const field of offered) if (!columns.has(field.key)) columns.set(field.key, field)
  }
  return { columns: [...columns.values()], byType }
}

const NUMERIC_TEXT = '^-?[0-9]+(\\.[0-9]+)?$'

function numberAt(key: string): SQL {
  return sql`case when (values ->> ${key}) ~ ${NUMERIC_TEXT} then (values ->> ${key})::numeric end`
}

interface SumRow extends Record<string, unknown> {
  grp: string
  type: string
}

export interface FieldSumQuery {
  range: ReportRange
  dateColumn: 'received_date' | 'issued_on'
  byMonth: boolean
}

export async function fieldSums(
  db: DbOrTx,
  config: ReportFieldConfig,
  query: FieldSumQuery,
  signal: AbortSignal,
): Promise<Map<string, FieldSums>> {
  signal.throwIfAborted()
  const sums = new Map<string, FieldSums>()
  const types = [...config.byType.keys()]
  const keys = config.columns.map((c) => c.key)
  if (types.length === 0) return sums
  const column = sql.identifier(query.dateColumn)
  const grp = query.byMonth ? sql`to_char(${column}, 'YYYY-MM')` : sql`''`
  const selects = keys.map(
    (key, i) => sql`sum(${numberAt(key)})::text as ${sql.identifier(`f${i}`)}`,
  )
  const result = await db.execute<SumRow>(sql`
    select ${grp} as grp, application_type_key as type, ${sql.join(selects, sql`, `)}
    from applications
    where ${column} between ${query.range.from}::date and ${query.range.to}::date
      and received_date is not null
      and application_type_key in (${sql.join(
        types.map((t) => sql`${t}`),
        sql`, `,
      )})
    group by 1, 2`)
  for (const row of result.rows) {
    const chosen = new Set(config.byType.get(row.type) ?? [])
    const entries = keys.flatMap((key, i): [string, number][] => {
      const raw = row[`f${i}`]
      return chosen.has(key) && typeof raw === 'string' ? [[key, Number(raw)]] : []
    })
    sums.set(`${row.grp}|${row.type}`, Object.fromEntries(entries))
  }
  return sums
}
