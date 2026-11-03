import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { splitPanels } from '@/components/layout/splitPanels'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { type DecisionView, loadDecisionView } from '@/features/decisions/decisionView'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { AppealsSection } from './AppealsSection'
import { DecisionRail } from './DecisionRail'
import { FilingSection } from './FilingSection'
import { TransmittalSection } from './TransmittalSection'

export const dynamic = 'force-dynamic'

function DecisionSection({ view }: { view: DecisionView }) {
  return (
    <section aria-labelledby="decision">
      <h2 id="decision">Decision</h2>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
        <dt className="font-medium">Motion</dt>
        <dd>{view.motion}</dd>
        <dt className="font-medium">Findings of fact</dt>
        <dd>{view.findings}</dd>
        {view.conditions.length === 0 ? null : (
          <>
            <dt className="font-medium">Conditions</dt>
            <dd>
              {view.conditions
                .map((c) => (c.precedent ? `Before issuance: ${c.text}` : c.text))
                .join(' ')}
            </dd>
          </>
        )}
        {view.reasons === null ? null : (
          <>
            <dt className="font-medium">Reasons for disapproval</dt>
            <dd>{view.reasons}</dd>
          </>
        )}
      </dl>
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
