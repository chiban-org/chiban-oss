'use client'

import { renderWording } from '@/features/notifications/wording/renderWording'
import type { Wording } from '@/features/notifications/wording/wordingDefaults'
import { SAMPLE_LINK_TEXT, sampleValues } from '@/features/notifications/wording/wordingSamples'

export function WordingPreview({ wording, townName }: { wording: Wording; townName: string }) {
  const rendered = renderWording(wording, sampleValues(townName), {
    href: SAMPLE_LINK_TEXT,
    label: SAMPLE_LINK_TEXT,
  })
  return (
    <section
      aria-label="Preview"
      data-plain
      className="rounded-md border border-hairline bg-surface p-4"
    >
      <h3 className="m-0 font-sans text-sm font-semibold text-muted-foreground">
        Preview with sample details
      </h3>
      <p className="mt-2 mb-0">
        <span className="text-muted-foreground">Subject: </span>
        <span className="font-semibold text-ink">{rendered.subject}</span>
      </p>
      <p className="mt-3 mb-0 whitespace-pre-wrap text-ink">{rendered.text.trimEnd()}</p>
    </section>
  )
}
