import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(import.meta.dirname)

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, acc)
    else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) acc.push(full)
  }
  return acc
}

type Jsx = ts.JsxElement | ts.JsxSelfClosingElement

function opening(node: Jsx) {
  return ts.isJsxElement(node) ? node.openingElement : node
}

function tag(node: Jsx): string {
  return opening(node).tagName.getText()
}

function attribute(node: Jsx, name: string) {
  return opening(node).attributes.properties.find(
    (a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === name,
  )
}

function classText(node: Jsx): string {
  const init = attribute(node, 'className')?.initializer
  if (init === undefined) return ''
  if (ts.isStringLiteral(init)) return init.text
  const expr = ts.isJsxExpression(init) ? init.expression : undefined
  return expr !== undefined &&
    (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr))
    ? expr.text
    : ''
}

const hasToken = (cls: string, re: RegExp) => cls.split(/\s+/).some((t) => re.test(t))
const isJsx = (n: ts.Node): n is Jsx => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)

function directChildren(node: Jsx): Jsx[] {
  const out: Jsx[] = []
  const visit = (n: ts.Node | undefined): void => {
    if (n === undefined) return
    if (isJsx(n)) out.push(n)
    else if (ts.isJsxFragment(n)) n.children.forEach(visit)
    else if (ts.isJsxExpression(n) || ts.isParenthesizedExpression(n)) visit(n.expression)
    else if (ts.isConditionalExpression(n)) [n.whenTrue, n.whenFalse].forEach(visit)
    else if (ts.isBinaryExpression(n)) visit(n.right)
  }
  if (ts.isJsxElement(node)) node.children.forEach(visit)
  return out
}

const intrinsic = (n: Jsx) => /^[a-z]/.test(tag(n))

function breaksAt(n: Jsx, line: (n: ts.Node) => number): string[] {
  const spaced = hasToken(classText(n), /^space-y-/)
  const panel = tag(n) === 'section' && attribute(n, 'data-plain') === undefined
  if (!panel && !spaced) return []
  const own = panel && spaced ? [`line ${line(n)}: a panel section carries space-y`] : []
  const children = directChildren(n)
    .filter((child) => intrinsic(child) && hasToken(classText(child), /^m-0$/))
    .map((child) => `line ${line(child)}: m-0 on a direct child cancels the spacing`)
  return [...own, ...children]
}

function rhythmBreaks(source: string): string[] {
  const file = ts.createSourceFile('x.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: string[] = []
  const line = (n: ts.Node) => file.getLineAndCharacterOfPosition(n.getStart()).line + 1
  const walk = (n: ts.Node): void => {
    if (isJsx(n) && intrinsic(n)) found.push(...breaksAt(n, line))
    ts.forEachChild(n, walk)
  }
  walk(file)
  return found
}

describe('section rhythm scan', () => {
  it('flags a panel section that sets its own space-y', () => {
    expect(rhythmBreaks('const a = <section className="space-y-3"><p>x</p></section>')).toEqual([
      'line 1: a panel section carries space-y',
    ])
  })

  it('flags m-0 on a direct child of a panel, which cancels the panel rhythm', () => {
    expect(rhythmBreaks('const a = <section><h2 className="m-0">T</h2><p>x</p></section>')).toEqual(
      ['line 1: m-0 on a direct child cancels the spacing'],
    )
  })

  it('flags m-0 on a child of any space-y container, conditional children included', () => {
    const source =
      'const a = <div className="space-y-2">{x ? <p className="m-0">a</p> : null}</div>'
    expect(rhythmBreaks(source)).toHaveLength(1)
  })

  it('leaves plain sections their own spacing and ignores grandchildren', () => {
    expect(
      rhythmBreaks('const a = <section data-plain className="space-y-3"><p>x</p></section>'),
    ).toEqual([])
    expect(
      rhythmBreaks('const a = <section><div><p className="m-0">x</p></div></section>'),
    ).toEqual([])
  })

  it.each(
    sourceFiles(SRC).map((f) => [path.relative(SRC, f).split(path.sep).join('/'), f]),
  )('%s keeps the shared rhythm', (_name, file) => {
    expect(rhythmBreaks(readFileSync(file, 'utf8'))).toEqual([])
  })
})
