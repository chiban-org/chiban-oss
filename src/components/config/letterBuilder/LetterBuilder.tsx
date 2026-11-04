'use client'

import { useEditor } from '@tiptap/react'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { BlockSettings } from '@/components/config/letterBuilder/BlockSettings'
import { letterExtensions } from '@/components/config/letterBuilder/extensions'
import { InsertPanel } from '@/components/config/letterBuilder/InsertPanel'
import { KindPicker } from '@/components/config/letterBuilder/KindPicker'
import { EDITOR_CLASS, LetterPage } from '@/components/config/letterBuilder/LetterPage'
import {
  type LetterPreview,
  LetterViewProvider,
} from '@/components/config/letterBuilder/letterView'
import { PreviewBar } from '@/components/config/letterBuilder/PreviewBar'
import { replaceDocument } from '@/components/config/letterBuilder/replaceDocument'
import { Toolbar } from '@/components/config/letterBuilder/Toolbar'
import { FieldError, type FieldErrors, Input, RowButton } from '@/components/config/primitives'
import type { TemplateBuilderData } from '@/features/templates/builderData'
import type { TemplateDoc } from '@/features/templates/doc/docSchema'
import { defaultDoc, documentKind } from '@/features/templates/kinds/documentKinds'
import { templateUse } from '@/features/templates/templateChecks'
import type { DocTemplateBody, TemplateKind } from '@/features/templates/templateSchema'

interface Props {
  body: DocTemplateBody
  onChange: (next: DocTemplateBody) => void
  errors: FieldErrors
  data: TemplateBuilderData
}

function keepEnterInEditor(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault()
}

function trimmed(doc: TemplateDoc): string {
  const content = [...doc.content]
  while (
    content.length > 1 &&
    content.at(-1)?.type === 'paragraph' &&
    content.at(-1)?.content === undefined
  ) {
    content.pop()
  }
  return JSON.stringify(content)
}

const sameDoc = (a: TemplateDoc, b: TemplateDoc) => trimmed(a) === trimmed(b)

export function LetterBuilder({ body, onChange, errors, data }: Props) {
  const [preview, setPreview] = useState<LetterPreview | null>(null)
  const anchor = useRef<HTMLDivElement>(null)
  const latest = useRef({ body, onChange })
  const emitted = useRef<TemplateDoc>(body.doc)
  useEffect(() => {
    latest.current = { body, onChange }
  })
  const extensions = useMemo(() => letterExtensions(), [])
  const editor = useEditor({
    extensions,
    content: body.doc,
    immediatelyRender: false,
    editorProps: { attributes: { class: EDITOR_CLASS, 'aria-label': 'Letter text' } },
    onUpdate: ({ editor: e }) => {
      const doc = e.getJSON() as TemplateDoc
      emitted.current = doc
      latest.current.onChange({ ...latest.current.body, doc })
    },
  })
  useEffect(() => {
    if (editor === null || body.doc === emitted.current) return
    emitted.current = body.doc
    const doc = body.doc
    queueMicrotask(() => replaceDocument(editor, doc))
  }, [editor, body.doc])
  useEffect(() => {
    if (editor === null) return
    const editable = preview === null
    queueMicrotask(() => {
      if (!editor.isDestroyed) editor.setEditable(editable)
    })
  }, [editor, preview])
  const kind = documentKind(body.kind)
  const used = templateUse(body).locked
  const missingLocked = kind.locked.filter((source) => !used.includes(source))
  const changeKind = (next: TemplateKind) => {
    const pristine = sameDoc(body.doc, defaultDoc(body.kind))
    setPreview(null)
    onChange({ ...body, kind: next, doc: pristine ? defaultDoc(next) : body.doc })
  }
  return (
    <LetterViewProvider value={{ kind: body.kind, preview }}>
      <div ref={anchor} className="@container" onKeyDown={keepEnterInEditor}>
        <div className="grid gap-3 @2xl:grid-cols-2">
          <Input
            label="Title of the document"
            value={body.label}
            onChange={(e) => onChange({ ...body, label: e.target.value })}
          />
          <KindPicker value={body.kind} locked={data.kindLocked} onChange={changeKind} />
        </div>
        <FieldError errors={errors} name="label" />
        <FieldError errors={errors} name="kind" />
        <div className="mt-6 grid gap-6 @3xl:grid-cols-[13rem_minmax(0,1fr)] @3xl:grid-rows-[auto_1fr] @6xl:grid-cols-[13rem_minmax(0,1fr)_18rem]">
          <div className="@3xl:col-start-1 @3xl:row-start-1">
            {editor === null ? null : (
              <InsertPanel
                editor={editor}
                kind={body.kind}
                missingLocked={missingLocked}
                disabled={preview !== null}
              />
            )}
          </div>
          <div className="grid min-w-0 content-start gap-3 rounded-md bg-canvas p-3 @md:p-4 @3xl:col-start-2 @3xl:row-span-2 @3xl:row-start-1 @6xl:row-span-1">
            {editor === null ? null : <Toolbar editor={editor} />}
            <PreviewBar
              kind={body.kind}
              data={data}
              anchor={anchor}
              previewing={preview !== null}
              onPreview={setPreview}
            />
            <FieldError errors={errors} name="body" />
            <FieldError errors={errors} name="doc" />
            <LetterPage
              editor={editor}
              data={data}
              title={body.label}
              recordLabel={preview?.recordLabel ?? null}
            />
          </div>
          <section
            aria-labelledby="block-settings-title"
            data-plain
            className="grid min-w-0 content-start gap-3 self-start @3xl:col-start-1 @3xl:row-start-2 @6xl:sticky @6xl:top-4 @6xl:col-start-3 @6xl:row-start-1"
          >
            <h2
              id="block-settings-title"
              className="m-0 font-sans text-sm font-bold text-muted-foreground"
            >
              Selected part
            </h2>
            {editor === null ? null : <BlockSettings editor={editor} kind={body.kind} />}
            <RowButton onClick={() => onChange({ ...body, doc: defaultDoc(body.kind) })}>
              Start again from the standard wording
            </RowButton>
          </section>
        </div>
      </div>
    </LetterViewProvider>
  )
}
