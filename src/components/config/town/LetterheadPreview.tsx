'use client'

import type { Board } from '@packs/nh/boardSchema'
import { useState } from 'react'
import { Pick } from '@/components/config/primitives'
import { LetterheadHeader } from '@/components/config/town/LetterheadHeader'
import { buildFrame } from '@/features/pdf/frame'
import { TOWN_BOARD_LABELS, type TownProfileBody } from '@/features/town/profileSchema'

interface Props {
  townName: string
  body: TownProfileBody
}

const SAMPLE_PATH = '/staff/settings/letterhead/sample.pdf'

function boardOf(value: string): Board | undefined {
  return TOWN_BOARD_LABELS.find(([board]) => board === value)?.[0]
}

export function LetterheadPreview({ townName, body }: Props) {
  const [board, setBoard] = useState<Board | undefined>(undefined)
  const frame = buildFrame(townName, body, board, new Map())
  const sampleHref = board === undefined ? SAMPLE_PATH : `${SAMPLE_PATH}?board=${board}`
  return (
    <section aria-labelledby="letterhead-preview" data-plain className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="letterhead-preview" className="m-0 text-base">
          Preview
        </h2>
        <div className="w-full sm:w-64">
          <Pick
            label="Preview for"
            value={board ?? ''}
            options={[['', 'Town documents'], ...TOWN_BOARD_LABELS]}
            onChange={(e) => setBoard(boardOf(e.target.value))}
          />
        </div>
      </div>
      <div
        className="mx-auto flex aspect-[8.5/11] w-full max-w-[34rem] flex-col rounded-sm border border-hairline bg-surface p-[6%] shadow-sm"
        aria-label="Letterhead preview"
      >
        <LetterheadHeader frame={frame} logo={body.logo} />
        <hr className="my-3 border-hairline" />
        <div aria-hidden className="grid flex-1 content-start gap-2 pt-2">
          <div className="h-3 w-1/2 rounded bg-canvas" />
          <div className="h-2 w-full rounded bg-canvas" />
          <div className="h-2 w-11/12 rounded bg-canvas" />
          <div className="h-2 w-4/5 rounded bg-canvas" />
        </div>
        <div className="flex items-end justify-between gap-3 text-[0.6rem] text-muted-foreground">
          <span>{frame.footerText}</span>
          {frame.pageNumbers ? <span className="shrink-0">Page 1 of 1</span> : null}
        </div>
      </div>
      <p className="m-0 text-sm">
        <a href={sampleHref} target="_blank" rel="noreferrer" className="text-action underline">
          Download sample PDF
        </a>
        <span className="text-muted-foreground">
          {' '}
          The sample uses the published letterhead, so publish your changes first.
        </span>
      </p>
    </section>
  )
}
