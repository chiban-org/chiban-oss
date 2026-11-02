import Link from 'next/link'
import { NoPermission } from '@/components/staff/NoPermission'
import { loadBoardsView } from '@/features/boards/boardsView'
import { requireStaffContext } from '@/server/requireStaff'

export const dynamic = 'force-dynamic'

export default async function BoardsPage() {
  const ctx = await requireStaffContext()
  const view = await loadBoardsView(ctx.db, ctx.actor, ctx.signal)
  if (view === null) return <NoPermission title="Boards" action="work with the boards" />
  return (
    <main className="space-y-8">
      <h1>Boards</h1>
      <p>
        <Link href="/staff/boards/meetings" className="text-action underline">
          Meeting calendar
        </Link>{' '}
        <Link href="/staff/boards/packets" className="text-action underline">
          Board packets
        </Link>{' '}
        <Link href="/staff/rosters" className="text-action underline">
          Rosters
        </Link>
      </p>
      {view.sections.map((section) => (
        <section key={section.board} aria-label={section.label} className="space-y-3">
          <h2>{section.label}</h2>
          {section.applications.length === 0 ? (
            <p>No applications are waiting on this board.</p>
          ) : null}
          {section.applications.length === 0 ? null : (
            <table className="w-full text-sm">
              <caption className="sr-only">{`Applications before the ${section.label}`}</caption>
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="py-2">
                    Application
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Filed</th>
                  <th scope="col">Meeting</th>
                  <th scope="col">Next deadline</th>
                </tr>
              </thead>
              <tbody>
                {section.applications.map((a) => (
                  <tr key={a.id} className="border-b align-top">
                    <td className="py-2">
                      <Link href={`/staff/applications/${a.id}`} className="text-action underline">
                        {a.number}
                      </Link>
                      <br />
                      {a.typeLabel}
                    </td>
                    <td>{a.stateText}</td>
                    <td>{a.filedText}</td>
                    <td>{a.meetingText ?? 'Not set'}</td>
                    <td>{a.deadlineText ?? 'None running'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </main>
  )
}
