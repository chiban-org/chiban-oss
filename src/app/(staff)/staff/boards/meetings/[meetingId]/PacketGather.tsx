import { ActionForm } from '@/components/ActionForm'
import { CheckField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'
import type { Exclusion } from '@/features/boards/packetCandidates'
import type { GatherCandidate, GatherGroup, PacketGather } from '@/features/boards/packetGather'
import { gatherPacketAction } from './packetActions'

const SHORT_BOARD_NAMES = { planning_board: 'Planning Board', zba: 'ZBA' } as const

export function exclusionText(exclusion: Exclusion): string {
  switch (exclusion.kind) {
    case 'not_shared':
      return 'Not shared with the board'
    case 'other_board':
      return `Belongs to the ${SHORT_BOARD_NAMES[exclusion.board]}`
    case 'no_public_copy':
      return 'No approved public copy'
  }
}

function Candidate({ candidate, canShare }: { candidate: GatherCandidate; canShare: boolean }) {
  if (candidate.exclusion === null) {
    return (
      <CheckField
        label={candidate.title}
        name="documentId"
        value={candidate.documentId}
        defaultChecked={candidate.checked}
      />
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6">
      <span>{candidate.title}</span>
      <span className="text-sm text-muted-foreground">{exclusionText(candidate.exclusion)}</span>
      {candidate.exclusion.kind === 'not_shared' && canShare ? (
        <Button type="submit" name="share" value={candidate.documentId} variant="outline" size="sm">
          Share with the board
        </Button>
      ) : null}
    </div>
  )
}

function Trc({ group }: { group: GatherGroup }) {
  if (group.applicationId === null || group.trc === null || group.trc === 'made') return null
  return group.trc === 'make' ? (
    <CheckField
      label="Make TRC summary"
      name="trcApplicationId"
      value={group.applicationId}
      defaultChecked
    />
  ) : (
    <p className="m-0 pl-6 text-sm text-muted-foreground">No TRC review on this application</p>
  )
}

export function GatherStep({ gather, canShare }: { gather: PacketGather; canShare: boolean }) {
  return (
    <ActionForm action={gatherPacketAction} submitLabel="Save the packet">
      <input type="hidden" name="meetingId" value={gather.meetingId} />
      {gather.groups.map((group) => (
        <fieldset key={group.applicationId ?? 'meeting'} className="space-y-2 border-0 p-0">
          <legend className="mb-2 font-semibold">{group.heading}</legend>
          {group.candidates.length === 0 && group.trc !== 'make' ? (
            <p className="m-0 text-sm text-muted-foreground">No documents on file.</p>
          ) : null}
          {group.candidates.map((c) => (
            <Candidate key={c.documentId} candidate={c} canShare={canShare} />
          ))}
          <Trc group={group} />
        </fieldset>
      ))}
    </ActionForm>
  )
}
