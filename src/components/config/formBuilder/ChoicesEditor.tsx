'use client'

import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addChoice, moveChoice, relabelChoice, removeChoice } from '@/features/forms/choiceEdits'
import type { FormBody } from '@/features/forms/formSchema'

export function ChoicesEditor({
  body,
  index,
  frozen,
  onChange,
}: {
  body: FormBody
  index: number
  frozen: ReadonlySet<string>
  onChange: (next: FormBody) => void
}) {
  const choices = body.fields[index]?.options ?? []
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-2 text-sm font-medium">Choices</legend>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {choices.map((choice, c) => {
          const n = c + 1
          return (
            <li key={`choice-${String(c)}`} className="flex items-center gap-1">
              <Input
                aria-label={`Choice ${n}`}
                value={choice.label}
                className="min-w-0 flex-1"
                onChange={(e) =>
                  onChange(relabelChoice(body, { index, choice: c }, e.target.value, frozen))
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Move choice ${n} up`}
                disabled={c === 0}
                onClick={() => onChange(moveChoice(body, index, c, -1))}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Move choice ${n} down`}
                disabled={c === choices.length - 1}
                onClick={() => onChange(moveChoice(body, index, c, 1))}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove choice ${n}`}
                disabled={choices.length === 1}
                onClick={() => onChange(removeChoice(body, index, c))}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          )
        })}
      </ol>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => onChange(addChoice(body, index))}
      >
        Add choice
      </Button>
    </fieldset>
  )
}
