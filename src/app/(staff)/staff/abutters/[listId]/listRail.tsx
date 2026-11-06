import { ActionForm } from '@/components/ActionForm'
import { NextStep } from '@/components/layout/NextStep'
import { type Fact, FactList } from '@/components/layout/PageHeader'
import { NEW_TAB } from '@/components/newTab'
import type { ListView } from '@/features/abutters/listView'
import { formatCents } from '@/lib/money'
import { issueListAction } from '../actions'

const RAIL_HEADING = 'font-sans text-sm font-semibold text-muted-foreground'

function listFacts(view: ListView): Fact[] {
  return [
    { label: 'Drawn', value: view.drawnText },
    ...(view.issuedText === null ? [] : [{ label: 'Issued', value: view.issuedText }]),
    ...(view.fingerprint === null
      ? []
      : [
          {
            label: 'Check code',
            value: (
              <>
                <span className="font-mono">{view.fingerprint}</span>
                <span className="block text-sm text-ink-secondary">
                  Matches every printed copy of this version.
                </span>
              </>
            ),
          },
        ]),
  ]
}

function CostCard({ view }: { view: ListView }) {
  return (
    <section
      aria-label="Notice cost"
      data-plain
      className="rail-card flex flex-col gap-2 [&>*]:m-0"
    >
      <h2 className={RAIL_HEADING}>Notice cost</h2>
      <p className="text-sm">{`${view.mailings} ${view.mailings === 1 ? 'mailing' : 'mailings'} on this list.`}</p>
      {view.notice.lines.map((line) => (
        <p key={line.code} className="text-sm">
          {`${line.label}: ${formatCents(line.assessedCents)}, ${formatCents(line.dueCents)} still due.`}
        </p>
      ))}
      {view.notice.lines.length === 0 ? (
        <p className="text-sm">The cost is worked out when a list is issued.</p>
      ) : null}
    </section>
  )
}

function LabelCard({ listId }: { listId: string }) {
  return (
    <section
      aria-label="Print mailing labels"
      data-plain
      className="rail-card flex flex-col gap-2 [&>*]:m-0"
    >
      <h2 className={RAIL_HEADING}>Print mailing labels</h2>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        <li>
          <a {...NEW_TAB} href={`/staff/abutters/${listId}/labels`}>
            Avery 5160
          </a>
        </li>
        <li>
          <a {...NEW_TAB} href={`/staff/abutters/${listId}/labels?sheet=avery_5163`}>
            Avery 5163
          </a>
        </li>
      </ul>
    </section>
  )
}

export function ListRail({ view }: { view: ListView }) {
  return (
    <>
      {view.canEdit ? (
        <div className="rail-card">
          <NextStep>
            <ActionForm
              action={issueListAction}
              submitLabel="Issue list"
              variant="default"
              confirm={{
                title: 'Issue this list?',
                body: 'Notice costs are calculated from it and any earlier issued list is replaced. This cannot be undone.',
                confirmLabel: 'Issue the list',
                tone: 'default',
              }}
            >
              <input type="hidden" name="listId" value={view.listId} />
            </ActionForm>
          </NextStep>
        </div>
      ) : null}
      <section aria-label="Key facts" data-plain className="rail-card">
        <FactList facts={listFacts(view)} stacked />
      </section>
      <CostCard view={view} />
      {view.status === 'issued' ? <LabelCard listId={view.listId} /> : null}
    </>
  )
}
