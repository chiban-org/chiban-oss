'use client'

import {
  AlignLeft,
  Binary,
  Calendar,
  CircleChevronDown,
  CircleDollarSign,
  Hash,
  Heading,
  ListChecks,
  type LucideIcon,
  Mail,
  Phone,
  TextCursorInput,
  ToggleLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FieldType } from '@/features/forms/formSchema'
import { PALETTE_ORDER, TYPE_WORDS } from '@/features/forms/questionTypes'

const ICONS: Record<FieldType, LucideIcon> = {
  text: TextCursorInput,
  textarea: AlignLeft,
  integer: Hash,
  decimal: Binary,
  money: CircleDollarSign,
  date: Calendar,
  select: CircleChevronDown,
  multiselect: ListChecks,
  checkbox: ToggleLeft,
  email: Mail,
  phone: Phone,
  section: Heading,
}

export function QuestionPalette({ onAdd }: { onAdd: (type: FieldType) => void }) {
  return (
    <nav aria-label="Add a question" className="min-w-0">
      <h2 className="mb-2 font-sans text-sm font-bold text-muted-foreground">Add a question</h2>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0 @5xl:flex-col @5xl:flex-nowrap">
        {PALETTE_ORDER.map((type) => {
          const Icon = ICONS[type]
          return (
            <li key={type} className={type === 'section' ? '@5xl:mt-2' : undefined}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Add ${TYPE_WORDS[type]}`}
                className="w-full justify-start gap-2 bg-surface"
                onClick={() => onAdd(type)}
              >
                <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                {TYPE_WORDS[type]}
              </Button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
