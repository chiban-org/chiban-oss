export interface OverlayIssue {
  path: string
  message: string
}

export function issueLine(issue: OverlayIssue): string {
  return `${issue.path === '' ? '(top level)' : issue.path}: ${issue.message}`
}

export class DemoOverlayError extends Error {
  readonly path: string

  constructor(issue: OverlayIssue) {
    super(`demo overlay: ${issueLine(issue)}`)
    this.name = 'DemoOverlayError'
    this.path = issue.path
  }
}

export function joinPath(...parts: (string | number)[]): string {
  return parts
    .map(String)
    .filter((p) => p !== '')
    .join('.')
}

interface ZodLikeIssue {
  path: PropertyKey[]
  message: string
  code?: string
  errors?: ZodLikeIssue[][]
}

const DISCRIMINATOR = 'op'

function matchedBranch(issue: ZodLikeIssue): ZodLikeIssue[] | null {
  if (issue.code !== 'invalid_union' || issue.errors === undefined) return null
  const matched = issue.errors.filter((branch) =>
    branch.every((i) => String(i.path[0]) !== DISCRIMINATOR),
  )
  return matched.length === 1 ? (matched[0] ?? null) : null
}

export function zodIssues(prefix: string, issues: readonly ZodLikeIssue[]): OverlayIssue[] {
  return issues.flatMap((i) => {
    const path = joinPath(prefix, ...i.path.map((p) => String(p)))
    const branch = matchedBranch(i)
    return branch === null ? [{ path, message: i.message }] : zodIssues(path, branch)
  })
}

export function failWith(issues: readonly OverlayIssue[]): void {
  const [first] = issues
  if (first !== undefined) throw new DemoOverlayError(first)
}
