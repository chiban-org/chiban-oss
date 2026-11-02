import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import { KIND_LABELS } from '@/features/config/kindLabels'
import { isConfigKind } from '@/features/config/kinds'
import { listKeysOfKind } from '@/features/config/settingsViews'
import { loadPack } from '@/features/packs/loadPack'
import { requireStaffContext } from '@/server/requireStaff'
import { startDraftAction } from '../actions'

const SINGLETON_KINDS = [
  'payment_settings',
  'inspection_settings',
  'board_settings',
  'regional_contacts',
  'review_routes',
]

interface Props {
  params: Promise<{ kind: string }>
}

export default async function SettingsKindPage({ params }: Props) {
  const { kind } = await params
  if (!isConfigKind(kind)) notFound()
  const ctx = await requireStaffContext()
  const rows = await listKeysOfKind(ctx.db, kind, ctx.signal)
  const townRules = loadPack().rules.filter((r) => r.kind === 'town_setting')
  return (
    <main>
      <p>
        <Link href="/staff/settings" className="text-action underline">
          Settings
        </Link>
      </p>
      <h1>{KIND_LABELS[kind]}</h1>
      {rows.length === 0 ? <p>Nothing is configured here yet.</p> : null}
      <table className="my-3 w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b">
              <td className="py-2">
                <Link
                  href={`/staff/settings/${kind}/${encodeURIComponent(row.key)}`}
                  className="text-action underline"
                >
                  {row.key}
                </Link>
              </td>
              <td>
                {row.publishedVersion === null
                  ? 'Not published'
                  : `Published version ${row.publishedVersion}`}
              </td>
              <td>{row.hasDraft ? 'Has an unpublished draft' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Start a new one</h2>
      <ActionForm action={startDraftAction} submitLabel="Start a draft" className="max-w-md">
        <input type="hidden" name="kind" value={kind} />
        {kind === 'town_rule_setting' ? (
          <SelectField
            label="Rule"
            name="key"
            options={townRules.map((r): [string, string] => [r.key, r.label])}
          />
        ) : SINGLETON_KINDS.includes(kind) ? (
          <input type="hidden" name="key" value="default" />
        ) : (
          <TextField
            label="Key"
            name="key"
            required
            hint="Letters, numbers, hyphens, underscores, and dots. Other items refer to it by this key."
          />
        )}
      </ActionForm>
    </main>
  )
}
