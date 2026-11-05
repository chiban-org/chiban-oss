'use client'

import { TextRows } from '@/components/config/plainFields'
import { Check, FieldError, type FieldErrors, Input } from '@/components/config/primitives'
import type { BoardSettingsBody } from '@/features/boards/boardSettings'
import { RECHECK_CONTACTS_DEFAULT_DAYS } from '@/features/boards/boardSettingsSchema'

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
          <legend className="px-1 text-sm font-medium">{board.label}</legend>
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
              <Input
                label="Filing deadline, days before the meeting"
                hint="How many days before a meeting an application must be filed. Leave empty to use the 21 days state law sets."
                type="number"
                min={1}
                value={board.filingLeadDays ?? ''}
                onChange={(e) =>
                  setBoard(index, { filingLeadDays: toNumberOrNull(e.target.value) })
                }
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
        <legend className="px-1 text-sm font-medium">Abutters across a street or stream</legend>
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
      <fieldset className="rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Notice contacts</legend>
        <Input
          label="Re-check notice contacts every N days"
          hint="Past this, an association, park or restriction holder shows Due for a check and lists print it as out of date. Nothing is blocked."
          type="number"
          min={1}
          max={3650}
          value={body.abutters.recheckContactsDays ?? RECHECK_CONTACTS_DEFAULT_DAYS}
          onChange={(e) =>
            setAbutters({
              recheckContactsDays: toNumberOrNull(e.target.value) ?? RECHECK_CONTACTS_DEFAULT_DAYS,
            })
          }
        />
        <FieldError errors={errors} name="abutters.recheckContactsDays" />
      </fieldset>
    </div>
  )
}
