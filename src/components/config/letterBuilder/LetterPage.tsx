'use client'

import { type Editor, EditorContent } from '@tiptap/react'
import { LetterheadHeader } from '@/components/config/town/LetterheadHeader'
import { buildFrame } from '@/features/pdf/frame'
import type { TemplateBuilderData } from '@/features/templates/builderData'

const CONTENT_STYLE = [
  'min-h-64 text-[0.95rem] leading-relaxed focus:outline-none',
  '[&_p]:my-2 [&_h2]:mt-4 [&_h2]:mb-1 [&_h2]:font-serif [&_h2]:text-lg [&_h3]:mt-3 [&_h3]:mb-1',
  '[&_h3]:text-base [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6',
].join(' ')

export const EDITOR_CLASS = CONTENT_STYLE

export function LetterPage({
  editor,
  data,
  title,
  recordLabel,
}: {
  editor: Editor | null
  data: TemplateBuilderData
  title: string
  recordLabel: string | null
}) {
  const frame = buildFrame(data.townName, data.profile, undefined, new Map())
  return (
    <article
      aria-label="Letter page"
      className="mx-auto flex w-full max-w-[52rem] flex-col rounded-sm border border-hairline bg-surface p-[6%] shadow-sm"
    >
      <LetterheadHeader frame={frame} logo={data.profile?.logo ?? null} />
      <hr className="my-3 border-hairline" />
      {recordLabel === null ? null : (
        <p className="m-0 mb-2 w-fit rounded-sm bg-highlight px-2 text-xs">{`Preview with ${recordLabel}`}</p>
      )}
      <p className="m-0 mb-2 font-serif text-2xl font-semibold">{title}</p>
      <EditorContent editor={editor} />
      <div className="mt-6 flex items-end justify-between gap-3 text-[0.65rem] text-muted-foreground">
        <span>{frame.footerText}</span>
        {frame.pageNumbers ? <span className="shrink-0">Page 1 of 1</span> : null}
      </div>
    </article>
  )
}
