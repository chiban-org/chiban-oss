'use client'

import { FilingLeadFields } from '@/components/config/FilingLeadFields'
import { TextRows } from '@/components/config/plainFields'
import { Check, FieldError, type FieldErrors, Input } from '@/components/config/primitives'
import { Legend } from '@/components/ui/legend'
import type { BoardSettingsBody } from '@/features/boards/boardSettings'

interface Props {
  body: BoardSettingsBody
  onChange: (next: BoardSettingsBody) => void
  errors: FieldErrors
}

function toNumberOrNull(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? null : parsed
}

export function BoardSettingsEditor({ body, onChange, errors }: Props) {
  const setBoard = (index: number, next: Partial<BoardSettingsBody['boards'][number]>) =>
    onChange({
      ...body,
      boards: body.boards.map((b, i) => (i === index ? { ...b, ...next } : b)),
    })
  const setAbutters = (next: Partial<BoardSettingsBody['abutters']>) =>
    onChange({ ...body, abutters: { ...body.abutters, ...next } })
  return (
    <div className="space-y-4">
      {body.boards.map((board, index) => (
        <fieldset key={board.board} className="rounded-md border p-3">
          <Legend bordered>{board.label}</Legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Board name"
              value={board.label}
              onChange={(e) => setBoard(index, { label: e.target.value })}
            />
            <Input
              label="Newspaper of record"
              hint="Where legal notices for this board are published."
              value={board.publicNotice.newspaper ?? ''}
              onChange={(e) =>
                setBoard(index, {
                  publicNotice: {
                    ...board.publicNotice,
                    newspaper: e.target.value === '' ? null : e.target.value,
                  },
                })
              }
            />
            <Input
              label="Website for notices"
              value={board.publicNotice.websiteUrl ?? ''}
              onChange={(e) =>
                setBoard(index, {
                  publicNotice: {
                    ...board.publicNotice,
                    websiteUrl: e.target.value === '' ? null : e.target.value,
                  },
                })
              }
            />
            {board.board === 'planning_board' ? (
              <FilingLeadFields
                board={board}
                onChange={(next) => setBoard(index, next)}
                errors={errors}
              />
            ) : null}
          </div>
          <div className="mt-2 space-y-1">
            <Check
              label="Notice by posting"
              checked={board.publicNotice.posting}
              onChange={(checked) =>
                setBoard(index, {
                  publicNotice: { ...board.publicNotice, posting: checked },
                })
              }
            />
            <Check
              label="Notice by publication"
              checked={board.publicNotice.publication}
              onChange={(checked) =>
                setBoard(index, {
                  publicNotice: { ...board.publicNotice, publication: checked },
                })
              }
            />
          </div>
          <div className="mt-3">
            <TextRows
              legend="Places where notices are posted"
              hint="Each place a paper notice goes up, for example Town Hall lobby."
              rowLabel="Place"
              addLabel="Add a place"
              values={board.publicNotice.bulletinBoards}
              onChange={(next) =>
                setBoard(index, { publicNotice: { ...board.publicNotice, bulletinBoards: next } })
              }
            />
          </div>
        </fieldset>
      ))}
      <fieldset className="rounded-md border p-3">
        <Legend bordered>Abutters across a street or stream</Legend>
        <p className="m-0 mb-2 text-sm text-muted-foreground">
          State law counts land directly across a street or stream as abutting. Chiban can find
          those owners from the town's road and water maps once someone has checked the maps.
        </p>
        <Check
          label="Include owners directly across a street or stream"
          checked={body.abutters.projectionEnabled}
          onChange={(checked) => setAbutters({ projectionEnabled: checked })}
        />
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Input
            label="Road and water maps checked by"
            value={body.abutters.layersConfirmedBy ?? ''}
            onChange={(e) =>
              setAbutters({ layersConfirmedBy: e.target.value === '' ? null : e.target.value })
            }
          />
          <Input
            label="Maps checked on"
            type="date"
            value={body.abutters.layersConfirmedOn ?? ''}
            onChange={(e) =>
              setAbutters({
                layersConfirmedOn:
                  e.target.value === ''
                    ? null
                    : (e.target.value as NonNullable<typeof body.abutters.layersConfirmedOn>),
              })
            }
          />
          <Input
            label="Usual road width, in feet"
            hint="Used where the map does not show a road's width. 50 is common."
            type="number"
            min={1}
            value={body.abutters.assumedRightOfWayFt}
            onChange={(e) =>
              setAbutters({ assumedRightOfWayFt: toNumberOrNull(e.target.value) ?? 50 })
            }
          />
        </div>
        <FieldError errors={errors} name="abutters.layersConfirmedBy" />
        <FieldError errors={errors} name="abutters.layersConfirmedOn" />
      </fieldset>
    </div>
  )
}
