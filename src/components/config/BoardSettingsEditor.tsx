'use client'

import {
  Check,
  FieldError,
  type FieldErrors,
  Input,
  ListInput,
} from '@/components/config/primitives'
import type { BoardSettingsBody } from '@/features/boards/boardSettings'

interface Props {
  body: BoardSettingsBody
  onChange: (next: BoardSettingsBody) => void
  errors: FieldErrors
}

const LINE_BREAKS = /\n/

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
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Board name"
              value={board.label}
              onChange={(e) => setBoard(index, { label: e.target.value })}
            />
            <Input
              label="Newspaper of record"
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
                label="Filing lead time in days (blank uses the statute's 21)"
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
          <ListInput
            label="Places where notices are posted, one per line"
            values={board.publicNotice.bulletinBoards}
            onValues={(next) =>
              setBoard(index, { publicNotice: { ...board.publicNotice, bulletinBoards: next } })
            }
            separator={LINE_BREAKS}
            multiline
          />
        </fieldset>
      ))}
      <fieldset className="rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">
          Across the street and across the stream
        </legend>
        <Check
          label="Use perpendicular projection to find abutters across streets and streams"
          checked={body.abutters.projectionEnabled}
          onChange={(checked) => setAbutters({ projectionEnabled: checked })}
        />
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Input
            label="Road and water layers confirmed by"
            value={body.abutters.layersConfirmedBy ?? ''}
            onChange={(e) =>
              setAbutters({ layersConfirmedBy: e.target.value === '' ? null : e.target.value })
            }
          />
          <Input
            label="Layers confirmed on"
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
            label="Assumed right-of-way width in feet"
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
