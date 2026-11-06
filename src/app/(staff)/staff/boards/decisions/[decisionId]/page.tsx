import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { splitPanels } from '@/components/layout/splitPanels'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { DescriptionList } from '@/components/ui/description-list'
import { hasCapability } from '@/features/authz/capabilities'
import { type DecisionView, loadDecisionView } from '@/features/decisions/decisionView'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { AppealsSection } from './AppealsSection'
import { DecisionRail } from './DecisionRail'
import { FilingSection } from './FilingSection'
import { TransmittalSection } from './TransmittalSection'

export const metadata: Metadata = { title: 'Board decision' }

export const dynamic = 'force-dynamic'

function DecisionSection({ view }: { view: DecisionView }) {
  return (
    <section aria-labelledby="decision">
      <h2 id="decision">Decision</h2>
      <DescriptionList
        labelWidth="wide"
        items={[
          { label: 'Motion', value: view.motion },
          { label: 'Findings of fact', value: view.findings },
          {
            label: 'Conditions',
            value:
              view.conditions.length === 0 ? null : (
                <ul className="m-0 grid list-disc gap-1 pl-5">
                  {view.conditions.map((c) => (
                    <li key={c.text}>{c.precedent ? `Before issuance: ${c.text}` : c.text}</li>
                  ))}
                </ul>
              ),
          },
          { label: 'Reasons for disapproval', value: view.reasons },
        ]}
      />
    </section>
  )
}

function NoticeOfDecisionSection({ view }: { view: DecisionView }) {
  return (
    <section aria-labelledby="notice-of-decision">
      <h2 id="notice-of-decision">Notice of Decision</h2>
      <p>
        {view.documentsGenerated
          ? 'The Notice of Decision and the decision letter are on the application.'
          : 'Not created yet.'}
      </p>
    </section>
  )
}

export default async function DecisionPage({
  params,
}: {
  params: Promise<{ decisionId: string }>
}) {
  const { decisionId } = await params
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'board.record', ctx.signal))) {
    return <NoPermission title="Decision" action="work with board decisions" />
  }
  if (!isUuid(decisionId)) notFound()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const view = await loadDecisionView(ctx.db, ctx.actor, decisionId, ctx.signal, today)
  if (view === null) notFound()
  const sections = splitPanels([
    { empty: false, node: <DecisionSection key="decision" view={view} /> },
    {
      empty: !view.documentsGenerated,
      node: <NoticeOfDecisionSection key="notice" view={view} />,
    },
    { empty: false, node: <FilingSection key="filing" view={view} today={today} /> },
    {
      empty: false,
      node: view.regional ? (
        <TransmittalSection key="transmittal" view={view} today={today} />
      ) : null,
    },
    { empty: false, node: <AppealsSection key="appeals" view={view} today={today} /> },
  ])
  return (
    <main>
      <PageHeader
        kicker={`Board decision, ${view.typeLabel} ${view.applicationNumber}`}
        title={`${view.outcomeText}, voted ${view.votedOnText}`}
        status={
          <StatusChip
            status={view.filedText === null ? 'neutral' : 'passed'}
            label={view.filedText === null ? 'Not filed' : 'Filed'}
          />
        }
      />
      <RecordLayout rail={<DecisionRail view={view} />} empty={sections.empty}>
        {sections.filled}
      </RecordLayout>
    </main>
  )
}
