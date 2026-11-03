import { NH_STARTERS } from '@packs/nh/starters'
import { adoptStarterAction } from '@/app/(staff)/staff/settings/actions'
import { ActionForm } from '@/components/ActionForm'

export function StarterList({
  adopted,
  canAdopt,
}: {
  adopted: ReadonlySet<string>
  canAdopt: boolean
}) {
  const taken = NH_STARTERS.filter((s) => adopted.has(s.applicationType.key))
  const open = NH_STARTERS.filter((s) => !adopted.has(s.applicationType.key))
  return (
    <>
      {open.map((starter) => (
        <div
          key={starter.id}
          className="my-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface p-3"
        >
          <div>
            <strong>{starter.applicationType.label}</strong>
            <p className="m-0 text-sm text-muted-foreground">{`Version ${starter.version}`}</p>
          </div>
          {canAdopt ? (
            <ActionForm action={adoptStarterAction} submitLabel="Adopt this starter">
              <input type="hidden" name="starterId" value={starter.id} />
            </ActionForm>
          ) : null}
        </div>
      ))}
      {taken.length === 0 ? null : (
        <details className="my-3">
          <summary className="cursor-pointer">
            {`${taken.length} ${taken.length === 1 ? 'starter' : 'starters'} adopted`}
          </summary>
          <ul className="mt-2">
            {taken.map((starter) => (
              <li key={starter.id}>{starter.applicationType.label}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
