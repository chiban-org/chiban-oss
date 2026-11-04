import { mergeAttributes, Node, ReactNodeViewRenderer } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { LockedGuard } from '@/components/config/letterBuilder/lockedGuard'
import { BlockView, MergeFieldView } from '@/components/config/letterBuilder/nodeViews'

const LETTER_BLOCK = 'letterBlock'

const LetterDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: `(block | ${LETTER_BLOCK})+`,
})

function parseAttr(raw: string | null, fallback: unknown): unknown {
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return fallback
  }
}

function atomBlock(name: string, attrs: Record<string, unknown>) {
  return Node.create({
    name,
    group: LETTER_BLOCK,
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
      return Object.fromEntries(
        Object.entries(attrs).map(([key, value]) => [
          key,
          {
            default: value,
            parseHTML: (element: HTMLElement) =>
              parseAttr(element.getAttribute(`data-${key}`), value),
            renderHTML: (values: Record<string, unknown>) => ({
              [`data-${key}`]: JSON.stringify(new Map(Object.entries(values)).get(key) ?? value),
            }),
          },
        ]),
      )
    },
    parseHTML() {
      return [{ tag: `div[data-block="${name}"]` }]
    },
    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes(HTMLAttributes, { 'data-block': name })]
    },
    addNodeView() {
      return ReactNodeViewRenderer(BlockView)
    },
  })
}

const MergeField = Node.create({
  name: 'mergeField',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { name: { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'span[data-merge-field]' }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-merge-field': '' }),
      `{{${String(node.attrs.name)}}}`,
    ]
  },
  addNodeView() {
    return ReactNodeViewRenderer(MergeFieldView)
  },
})

const NoticeBox = Node.create({
  name: 'noticeBox',
  group: LETTER_BLOCK,
  content: 'inline*',
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-block="noticeBox"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-block': 'noticeBox',
        class: 'my-2 border-2 border-ink px-3 py-2 font-bold',
      }),
      0,
    ]
  },
})

export function letterExtensions() {
  return [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      underline: false,
      link: false,
      heading: { levels: [2, 3] },
      document: false,
    }),
    LetterDocument,
    MergeField,
    NoticeBox,
    atomBlock('signature', { role: 'land_use_administrator' }),
    atomBlock('conditionsList', {}),
    atomBlock('fieldTable', { rows: [] }),
    atomBlock('lockedBlock', { source: '' }),
    atomBlock('recordSection', { name: '' }),
    LockedGuard,
  ]
}
