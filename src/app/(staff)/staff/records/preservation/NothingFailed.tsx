import { awaitingFirstCopyText } from '@/features/preservation/pendingCount'

export function NothingFailed({ waiting, retrying }: { waiting: number; retrying: number }) {
  const note = awaitingFirstCopyText(waiting)
  return (
    <div className="px-5 py-8">
      <p className="m-0">
        {retrying === 0 ? 'No archival copy has failed.' : 'Nothing needs fixing right now.'}
      </p>
      {note === null ? null : <p className="mt-2 mb-0">{note}</p>}
    </div>
  )
}
