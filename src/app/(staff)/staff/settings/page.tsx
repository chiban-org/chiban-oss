import { NH_STARTERS } from '@packs/nh/starters'
import Link from 'next/link'
import { adoptStarterAction } from '@/app/(staff)/staff/settings/actions'
import { ActionForm } from '@/components/ActionForm'
import { CodeEditionTable } from '@/components/config/CodeEditionTable'
import { KIND_LABELS } from '@/features/config/kindLabels'
import { listKeysOfKind, summarizeKinds } from '@/features/config/settingsViews'
import { loadPack } from '@/features/packs/loadPack'
import { packInfo } from '@/features/packs/packInfo'
import { classificationSummary, ruleSummary } from '@/features/packs/ruleSummary'
import { createContext } from '@/server/trpc/context'

export default async function SettingsPage() {
  const ctx = await createContext()
  const kinds = await summarizeKinds(ctx.db, ctx.signal)
  const adopted = new Set(
    (await listKeysOfKind(ctx.db, 'application_type', ctx.signal)).map((k) => k.key),
  )
  const pack = loadPack()
  const info = packInfo()
  return (
    <main>
      <h1>Settings</h1>
      <p className="text-muted-foreground">
        Everything a permit needs is configuration: forms, fee schedules, templates, conditions,
        checklists, application types, and the few values the statute leaves to the town. Each
        change is a new version. Applications already open keep the versions they started under.
      </p>
      <h2>Configuration</h2>
      <table className="my-3 w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1">Kind</th>
            <th>Items</th>
          </tr>
        </thead>
        <tbody>
          {kinds.map((k) => (
            <tr key={k.kind} className="border-b">
              <td className="py-1">
                <Link href={`/staff/settings/${k.kind}`} className="text-action underline">
                  {KIND_LABELS[k.kind]}
                </Link>
              </td>
              <td>{k.keys}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Starter templates</h2>
      <p className="text-muted-foreground">
        A starter copies a complete set of forms, fees, conditions, checklists, a permit template,
        and an application type into your configuration. The fee amounts are examples for the
        fictional Town of Alder Pond. Change them to your own schedule before you use them.
      </p>
      {NH_STARTERS.map((starter) => (
        <div
          key={starter.id}
          className="my-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface p-3"
        >
          <div>
            <strong>{starter.applicationType.label}</strong>
            <p className="m-0 text-sm text-muted-foreground">{`${starter.id}, version ${starter.version}`}</p>
          </div>
          {adopted.has(starter.applicationType.key) ? (
            <span>Adopted</span>
          ) : (
            <ActionForm action={adoptStarterAction} submitLabel="Adopt this starter">
              <input type="hidden" name="starterId" value={starter.id} />
            </ActionForm>
          )}
        </div>
      ))}
      <h2>Jurisdiction pack</h2>
      <p className="text-muted-foreground">{`Pack ${info.id} version ${info.version}, fingerprint ${info.hash.slice(0, 12)}. The rules below come from state law. The town can change only what the policy column allows.`}</p>
      <table className="my-3 w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1">Rule</th>
            <th>Citation</th>
            <th>What the town can change</th>
          </tr>
        </thead>
        <tbody>
          {pack.rules.map((rule) => {
            const summary = ruleSummary(rule)
            return (
              <tr key={`${rule.key}-${rule.version}`} className="border-b align-top">
                <td className="py-1">
                  {summary.label}
                  <span className="block text-muted-foreground">{`${summary.key} version ${summary.version}`}</span>
                </td>
                <td>
                  {summary.citation.url === null ? (
                    summary.citation.label
                  ) : (
                    <a href={summary.citation.url} className="text-action underline">
                      {summary.citation.label}
                    </a>
                  )}
                </td>
                <td>{summary.policy}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <h3>Required rules by classification</h3>
      <ul>
        {pack.classifications.map((c) => {
          const summary = classificationSummary(c, pack)
          return <li key={summary.key}>{`${summary.label}: ${summary.mandatory.join('; ')}`}</li>
        })}
      </ul>
      <h2>State building code editions</h2>
      <CodeEditionTable editions={pack.codeEditions} />
    </main>
  )
}
