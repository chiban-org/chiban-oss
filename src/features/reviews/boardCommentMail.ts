import { env } from '@/config/env'
import type { MailMessage } from '@/features/mail/transport'
import { escapeHtml } from '@/features/templates/renderTemplate'
import { formatCivilDate } from '@/lib/formatDate'

export interface BoardCommentRequest {
  boardName: string
  number: string
  projectTitle: string
  commentBy: string | null
}

export function boardCommentMail(to: string, request: BoardCommentRequest): MailMessage {
  const lines = [
    `The land use office asks the ${request.boardName} for comments on application ${request.number}, ${request.projectTitle}.`,
    ...(request.commentBy === null ? [] : [`Comments by ${formatCivilDate(request.commentBy)}.`]),
    `Sign in at ${env.BASE_URL}/board to read the application and comment.`,
  ]
  return {
    to,
    subject: `Comments requested: ${request.number}, ${request.projectTitle}`,
    text: `${lines.join('\n\n')}\n`,
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(''),
  }
}
