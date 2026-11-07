'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { FormDialog, RowEditDialog } from '@/components/FormDialog'
import { TextField } from '@/components/staff/fields'
import { Label } from '@/components/ui/label'
import { Legend } from '@/components/ui/legend'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { BoardKindOption } from '@/features/boards/boardsAdminView'
import { addBoardAction, archiveBoardAction, renameBoardAction } from './actions'

const NAME_MAX = 120

function KindChoice({
  kinds,
  value,
  onChange,
}: {
  kinds: readonly BoardKindOption[]
  value: string
  onChange: (kind: string) => void
}) {
  return (
    <fieldset className="space-y-2 border-0 p-0">
      <Legend>Kind of board</Legend>
      <p className="text-sm text-muted-foreground">
        The kind is fixed once the board is added. To change it, add a new board and archive this
        one.
      </p>
      <RadioGroup name="kind" value={value} onValueChange={onChange} className="gap-2">
        {kinds.map((k) => {
          const id = `board-kind-${k.kind}`
          return (
            <div key={k.kind} className="flex items-start gap-3">
              <RadioGroupItem
                id={id}
                value={k.kind}
                disabled={k.disabledReason !== null}
                aria-describedby={`${id}-note`}
                className="mt-1.5"
              />
              <div className="grid gap-0.5">
                <Label htmlFor={id} className="text-base">
                  {k.label}
                </Label>
                <p id={`${id}-note`} className="m-0 text-sm text-muted-foreground">
                  {k.disabledReason ?? k.description}
                </p>
              </div>
            </div>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}

export function AddBoard({ kinds }: { kinds: readonly BoardKindOption[] }) {
  const first = kinds.find((k) => k.disabledReason === null) ?? kinds[0]
  const [kind, setKind] = useState(first?.kind ?? '')
  const [shortName, setShortName] = useState(first?.defaultShortName ?? '')
  const [edited, setEdited] = useState(false)
  const choose = (next: string) => {
    setKind(next)
    if (!edited) setShortName(kinds.find((k) => k.kind === next)?.defaultShortName ?? '')
  }
  return (
    <FormDialog
      label="Add a board"
      title="Add a board"
      description="A board gets members, meetings, agendas and minutes, and is listed on the public meetings page."
      variant="default"
    >
      <ActionForm
        action={addBoardAction}
        submitLabel="Add board"
        closeOnSuccess
        className="max-w-xl"
      >
        <TextField
          label="Name"
          name="name"
          required
          maxLength={NAME_MAX}
          hint="The full name, as it appears on notices and minutes."
        />
        <TextField
          label="Short name"
          name="shortName"
          required
          maxLength={NAME_MAX}
          value={shortName}
          onChange={(e) => {
            setShortName(e.target.value)
            setEdited(true)
          }}
          hint="Used where space is short, such as the meeting list."
        />
        <KindChoice kinds={kinds} value={kind} onChange={choose} />
      </ActionForm>
    </FormDialog>
  )
}

export function RenameBoard({
  boardId,
  name,
  shortName,
}: {
  boardId: string
  name: string
  shortName: string
}) {
  return (
    <RowEditDialog
      record={name}
      title={`Edit ${name}`}
      description="Past meetings, minutes and decisions show the new name too."
    >
      <ActionForm action={renameBoardAction} submitLabel="Save changes" className="max-w-md">
        <input type="hidden" name="boardId" value={boardId} />
        <TextField label="Name" name="name" defaultValue={name} required maxLength={NAME_MAX} />
        <TextField
          label="Short name"
          name="shortName"
          defaultValue={shortName}
          required
          maxLength={NAME_MAX}
        />
      </ActionForm>
    </RowEditDialog>
  )
}

export function ArchiveBoard({ boardId, name }: { boardId: string; name: string }) {
  return (
    <ActionForm
      action={archiveBoardAction}
      submitLabel="Archive"
      submitAccessibleLabel={`Archive ${name}`}
      variant="destructive"
      confirm={{
        title: `Archive ${name}?`,
        body: `${name} drops out of every list and picker. Its meetings, minutes, decisions and packets stay and keep its name.`,
        confirmLabel: 'Archive board',
      }}
      compact
    >
      <input type="hidden" name="boardId" value={boardId} />
    </ActionForm>
  )
}
