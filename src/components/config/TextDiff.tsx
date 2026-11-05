import { diffWords } from '@/lib/wordDiff'

const TEXT_BLOCK = 'm-0 whitespace-pre-wrap break-words text-sm'

export function InlineDiff({ before, after }: { before: string; after: string }) {
  return (
    <p className={TEXT_BLOCK}>
      {diffWords(before, after).map((part, i) => {
        const key = `${part.kind}:${i}`
        if (part.kind === 'removed') {
          return (
            <del key={key} className="rounded-sm bg-status-failed-bg px-0.5 text-status-failed-fg">
              {part.text}
            </del>
          )
        }
        if (part.kind === 'added') {
          return (
            <ins
              key={key}
              className="rounded-sm bg-status-passed-bg px-0.5 text-status-passed-fg no-underline"
            >
              {part.text}
            </ins>
          )
        }
        return <span key={key}>{part.text}</span>
      })}
    </p>
  )
}

export function WordDiffPreview({ before, after }: { before: string; after: string }) {
  return (
    <section aria-label="What changed" className="space-y-1.5 rounded-md border bg-surface p-3">
      <h3 className="m-0 text-sm font-medium">What changed, word by word</h3>
      <InlineDiff before={before} after={after} />
    </section>
  )
}

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <div role="group" aria-label={label} className="min-w-0 rounded-md border p-3">
      <p className="m-0 mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <p className={TEXT_BLOCK}>{text}</p>
    </div>
  )
}

export function AmendmentText({
  stateText,
  townText,
}: {
  stateText?: string | undefined
  townText?: string | undefined
}) {
  const state = stateText?.trim() ?? ''
  const town = townText?.trim() ?? ''
  if (state === '' && town === '') return null
  if (state === '') return <TextBlock label="Town's amended text" text={town} />
  if (town === '') return <TextBlock label="State code text" text={state} />
  return (
    <section aria-label="What changed" className="space-y-3">
      <h3 className="m-0 text-sm font-medium">What changed</h3>
      <div data-columns className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TextBlock label="State code text" text={state} />
        <TextBlock label="Town's amended text" text={town} />
      </div>
      <div role="group" aria-label="Word by word" className="min-w-0 rounded-md border p-3">
        <p className="m-0 mb-1 text-xs font-medium text-muted-foreground">Word by word</p>
        <InlineDiff before={state} after={town} />
      </div>
    </section>
  )
}
