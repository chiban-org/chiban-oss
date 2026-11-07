import type { Metadata } from 'next'
import { StatusChip } from '@/components/StatusChip'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { type BoardAdminRow, loadBoardsAdminView } from '@/features/boards/boardsAdminView'
import { recordStaffContext } from '@/server/requireStaff'
import { AddBoard, ArchiveBoard, RenameBoard } from './BoardForms'

export const metadata: Metadata = { title: 'Boards' }

export const dynamic = 'force-dynamic'

function BoardRow({ row }: { row: BoardAdminRow }) {
  return (
    <tr className="align-top">
      <td className="font-semibold">
        {row.name}
        {row.shortName === row.name ? null : (
          <span className="block text-sm font-normal text-muted-foreground">{row.shortName}</span>
        )}
      </td>
      <td>{row.kindText}</td>
      <td>{row.seated}</td>
      <td>{row.nextMeetingText ?? 'None scheduled'}</td>
      <td>
        <StatusChip
          status={row.active ? 'passed' : 'neutral'}
          label={row.active ? 'Active' : 'Archived'}
        />
      </td>
      <td>
        {row.active ? (
          <div className="row-actions">
            <RenameBoard boardId={row.id} name={row.name} shortName={row.shortName} />
            <ArchiveBoard boardId={row.id} name={row.name} />
          </div>
        ) : null}
      </td>
    </tr>
  )
}

export default async function BoardsSettingsPage() {
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Boards" action="change settings" />
  const view = await loadBoardsAdminView(ctx.db, ctx.actor, ctx.signal)
  if (view === null) return <NoPermission title="Boards" action="change settings" />
  return (
    <main data-wide="">
      <SettingsHeader
        title="Boards"
        lead="The boards and commissions your town runs in Chiban. Each has its own members, meetings, agendas and minutes. A board with history is archived, never deleted."
        action={<AddBoard kinds={view.kinds} />}
      />
      <div className="table-panel">
        <table className="w-full min-w-[44rem] text-sm">
          <caption className="sr-only">Boards</caption>
          <thead>
            <tr>
              <th scope="col">Board</th>
              <th scope="col">Kind</th>
              <th scope="col">Seated members</th>
              <th scope="col">Next meeting</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <BoardRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
