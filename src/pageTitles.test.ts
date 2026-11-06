import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const APP = path.resolve(import.meta.dirname, 'app')

function pageFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) pageFiles(full, acc)
    else if (entry.name === 'page.tsx') acc.push(full)
  }
  return acc
}

const relative = (file: string) => path.relative(APP, file).split(path.sep).join('/')
const TITLED = /export (?:const metadata\b|async function generateMetadata\b)/

describe('page titles', () => {
  const pages = pageFiles(APP)

  it('finds the pages', () => {
    expect(pages.length).toBeGreaterThan(50)
  })

  it('gives every page its own metadata or generateMetadata', () => {
    const untitled = pages.filter((f) => !TITLED.test(readFileSync(f, 'utf8'))).map(relative)
    expect(untitled).toEqual([])
  })

  it('puts the site name after the page name through one title template', () => {
    const site = readFileSync(path.join(APP, 'siteRoot.tsx'), 'utf8')
    expect(site).toContain("template: '%s · Chiban'")
  })
})
