'use client'

import { FileText, X } from 'lucide-react'
import {
  type ChangeEvent,
  type ComponentProps,
  type DragEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { Button } from '@/components/ui/button'
import { DropzoneText } from '@/components/ui/file-picker-text'
import { cn } from '@/lib/utils'

const BYTES_PER_KB = 1024
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB

const TYPE_LABELS = new Map<string, string>(
  Object.entries({
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'application/pdf': 'PDF',
    'text/csv': 'CSV',
    'text/plain': 'TXT',
    '.jpg': 'JPEG',
    '.jpeg': 'JPEG',
    '.png': 'PNG',
    '.pdf': 'PDF',
    '.csv': 'CSV',
    '.txt': 'TXT',
  }),
)

export function formatFileSize(bytes: number): string {
  if (bytes >= BYTES_PER_MB) return `${Number((bytes / BYTES_PER_MB).toFixed(1))} MB`
  if (bytes >= BYTES_PER_KB) return `${Math.round(bytes / BYTES_PER_KB)} KB`
  return `${bytes} B`
}

function acceptTokens(accept: string | undefined): string[] {
  if (accept === undefined) return []
  return accept
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token !== '')
}

function matchesAccept(file: File, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return tokens.some((token) => {
    if (token.startsWith('.')) return name.endsWith(token)
    if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1))
    return type === token
  })
}

function describeAccept(tokens: string[]): string | null {
  const labels = new Set<string>()
  for (const token of tokens) {
    if (token === 'image/*') labels.add('Images')
    else
      labels.add(
        TYPE_LABELS.get(token) ??
          token.replace(/^\./, '').split('/').at(-1)?.toUpperCase() ??
          token,
      )
  }
  return labels.size === 0 ? null : Array.from(labels).join(', ')
}

function hintFor(tokens: string[], maxSize: number | undefined): string {
  const types = describeAccept(tokens)
  const limit = maxSize === undefined ? null : `Up to ${formatFileSize(maxSize)} each`
  return [types, limit].filter((part) => part !== null).join('. ')
}

function syncInput(input: HTMLInputElement | null, files: File[]) {
  if (input === null || typeof DataTransfer === 'undefined') return
  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)
  input.files = transfer.files
}

function Thumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null)
  const isImage = file.type.startsWith('image/')
  useEffect(() => {
    if (!isImage || typeof URL.createObjectURL !== 'function') return
    const created = URL.createObjectURL(file)
    setUrl(created)
    return () => {
      URL.revokeObjectURL(created)
      setUrl(null)
    }
  }, [file, isImage])
  if (url === null) {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-hairline bg-canvas text-muted-foreground">
        <FileText className="size-5" aria-hidden="true" />
      </span>
    )
  }
  return (
    <img
      src={url}
      alt=""
      className="size-10 shrink-0 rounded-md border border-hairline bg-canvas object-cover"
    />
  )
}

type InputProps = Omit<
  ComponentProps<'input'>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'size'
>

interface FilePickerProps extends InputProps {
  maxSize?: number
  onFilesChange?: (files: File[]) => void
  prompt?: string
  chooseLabel?: string
  compact?: boolean
}

export function FilePicker({
  className,
  accept,
  multiple = false,
  disabled = false,
  maxSize,
  onFilesChange,
  prompt,
  chooseLabel,
  compact = false,
  'aria-describedby': describedBy,
  ...props
}: FilePickerProps) {
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const tokens = acceptTokens(accept)

  const take = (incoming: File[]) => {
    if (incoming.length === 0) return
    const accepted: File[] = []
    const rejected: string[] = []
    for (const file of incoming) {
      if (!matchesAccept(file, tokens)) rejected.push(`${file.name} is not an accepted file type.`)
      else if (maxSize !== undefined && file.size > maxSize)
        rejected.push(`${file.name} is larger than ${formatFileSize(maxSize)}.`)
      else accepted.push(file)
    }
    setErrors(rejected)
    const next = multiple
      ? [...files, ...accepted]
      : accepted.length > 0
        ? accepted.slice(0, 1)
        : files
    commit(next)
  }

  const commit = (next: File[]) => {
    setFiles(next)
    syncInput(inputRef.current, next)
    onFilesChange?.(next)
  }

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) =>
    take(Array.from(event.currentTarget.files ?? []))

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    if (disabled) return
    take(Array.from(event.dataTransfer.files))
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!disabled) setDragging(true)
  }

  const remove = (index: number) => {
    setErrors([])
    commit(files.filter((_, at) => at !== index))
  }

  const hint = hintFor(tokens, maxSize)
  const describedByIds = [describedBy, errors.length > 0 ? errorId : undefined]
    .filter((id) => id !== undefined)
    .join(' ')

  return (
    <div data-slot="file-picker" className={cn('grid gap-2', className)}>
      <div
        data-slot="file-picker-dropzone"
        data-dragging={dragging}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'relative flex items-center gap-2 rounded-lg border border-dashed border-control-border bg-surface text-center transition-colors',
          compact ? 'flex-row flex-wrap px-2 py-1.5' : 'flex-col px-4 py-6',
          'hover:border-primary hover:bg-canvas',
          'has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50',
          'has-[input[aria-invalid=true]]:border-destructive',
          'data-[dragging=true]:border-primary data-[dragging=true]:bg-canvas data-[dragging=true]:ring-[3px] data-[dragging=true]:ring-ring/30',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <input
          type="file"
          {...props}
          ref={inputRef}
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-describedby={describedByIds === '' ? undefined : describedByIds}
          onChange={onInputChange}
          className="sr-only"
        />
        <DropzoneText
          compact={compact}
          prompt={prompt ?? (multiple ? 'Drag files here or' : 'Drag a file here or')}
          chooseLabel={chooseLabel ?? (multiple ? 'Choose files' : 'Choose file')}
          hint={hint}
          disabled={disabled}
          onChoose={() => inputRef.current?.click()}
        />
      </div>
      {errors.length === 0 ? null : (
        <div id={errorId} role="alert" className="grid gap-1 text-sm text-status-failed-fg">
          {errors.map((message) => (
            <p key={message} className="m-0">
              {message}
            </p>
          ))}
        </div>
      )}
      {files.length === 0 ? null : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              className="flex items-center gap-3 rounded-md border border-hairline bg-surface p-2"
            >
              <Thumbnail file={file} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{file.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${file.name}`}
                disabled={disabled}
                onClick={() => remove(index)}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
