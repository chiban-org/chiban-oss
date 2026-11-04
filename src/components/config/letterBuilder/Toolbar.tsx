'use client'

import { type Editor, useEditorState } from '@tiptap/react'
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  type LucideIcon,
  Redo2,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Tool {
  label: string
  icon: LucideIcon
  active?: boolean
  disabled?: boolean
  run: () => void
}

function ToolButton({ tool }: { tool: Tool }) {
  const Icon = tool.icon
  return (
    <Button
      type="button"
      size="icon-sm"
      variant={tool.active === true ? 'outline' : 'ghost'}
      aria-label={tool.label}
      title={tool.label}
      {...(tool.active === undefined ? {} : { 'aria-pressed': tool.active })}
      disabled={tool.disabled}
      onClick={tool.run}
    >
      <Icon aria-hidden="true" />
    </Button>
  )
}

export function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      heading: e.isActive('heading'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      editable: e.isEditable,
    }),
  })
  const chain = () => editor.chain().focus()
  const tools: Tool[] = [
    { label: 'Bold', icon: Bold, active: state.bold, run: () => chain().toggleBold().run() },
    {
      label: 'Italic',
      icon: Italic,
      active: state.italic,
      run: () => chain().toggleItalic().run(),
    },
    {
      label: 'Heading',
      icon: Heading2,
      active: state.heading,
      run: () => chain().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'Bulleted list',
      icon: List,
      active: state.bullet,
      run: () => chain().toggleBulletList().run(),
    },
    {
      label: 'Numbered list',
      icon: ListOrdered,
      active: state.ordered,
      run: () => chain().toggleOrderedList().run(),
    },
    { label: 'Undo', icon: Undo2, disabled: !state.canUndo, run: () => chain().undo().run() },
    { label: 'Redo', icon: Redo2, disabled: !state.canRedo, run: () => chain().redo().run() },
  ]
  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className="flex flex-wrap items-center gap-1 rounded-md border border-hairline bg-surface p-1"
    >
      {tools.map((tool) => (
        <ToolButton
          key={tool.label}
          tool={{ ...tool, disabled: tool.disabled === true || !state.editable }}
        />
      ))}
    </div>
  )
}
