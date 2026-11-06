import { NH_STARTERS } from '@packs/nh/starters'
import { adoptStarterAction } from '@/app/(staff)/staff/settings/starterActions'
import { ActionForm } from '@/components/ActionForm'

export function StarterList({ adopted }: { adopted: ReadonlySet<string> }) {
  const taken = NH_STARTERS.filter((s) => adopted.has(s.applicationType.key))
  const open = NH_STARTERS.filter((s) => !adopted.has(s.applicationType.key))
  return (
    <>
      <section aria-labelledby="starters-open">
        <h2 id="starters-open">Ready to adopt</h2>
        {open.length === 0 ? <p>Every starter has been adopted.</p> : null}
        <ul className="list-none p-0">
          {open.map((starter) => (
            <li
              key={starter.id}
              className="record-item flex flex-wrap items-center justify-between gap-3 pb-3"
            >
              <div>
                <strong>{starter.applicationType.label}</strong>
                <p className="m-0 text-sm text-muted-foreground">{`Version ${starter.version}`}</p>
              </div>
              <ActionForm action={adoptStarterAction} submitLabel="Adopt this starter">
                <input type="hidden" name="starterId" value={starter.id} />
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="starters-adopted">
        <h2 id="starters-adopted">Adopted</h2>
        {taken.length === 0 ? (
          <p>No starter has been adopted yet.</p>
        ) : (
          <ul className="list-none p-0">
            {taken.map((starter) => (
              <li key={starter.id} className="record-item pb-3">
                <strong>{starter.applicationType.label}</strong>
                <p className="m-0 text-sm text-muted-foreground">{`Version ${starter.version}`}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
