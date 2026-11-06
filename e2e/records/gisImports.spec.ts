import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/test'
import { expectRefusedBeside } from './refusal'
import { expectToast, openDetails } from './requestSupport'

const ROADS_FILE = path.resolve('src/features/demo/fixtures/alder-pond-roads.geojson')

function layerCard(page: Page, name: string) {
  return page.getByRole('region', { name })
}

test.describe('uploading a layer file as the clerk', () => {
  test.use({ role: 'staff' })

  test('reports an empty file as empty and starts no run', async ({ page, db }) => {
    const before = await db.one<{ n: string }>(
      "select count(*) as n from import_runs where layer_key = 'roads'",
    )
    await page.goto('/staff/gis/imports')
    const roads = layerCard(page, 'roads')
    await roads.locator('input[type="file"]').setInputFiles({
      name: 'empty.geojson',
      mimeType: 'application/geo+json',
      buffer: Buffer.alloc(0),
    })
    await roads.getByRole('button', { name: 'Run import' }).click()
    await expect(roads.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'That file is empty. Choose a file with content.',
    )
    const after = await db.one<{ n: string }>(
      "select count(*) as n from import_runs where layer_key = 'roads'",
    )
    expect(after.n).toBe(before.n)
  })

  test('imports a real roads file and links the run report', async ({ page, db }) => {
    await page.goto('/staff/gis/imports')
    const roads = layerCard(page, 'roads')
    await roads.locator('input[type="file"]').setInputFiles({
      name: 'roads.geojson',
      mimeType: 'application/geo+json',
      buffer: readFileSync(ROADS_FILE),
    })
    await roads.getByRole('button', { name: 'Run import' }).click()
    const report = roads.getByRole('link', { name: 'Import finished. View the run report.' })
    await expect(report).toBeVisible()
    const runId = ((await report.getAttribute('href')) ?? '').split('/').pop() ?? ''
    const run = await db.one<{ layer_key: string; status: string }>(
      'select layer_key, status from import_runs where id = $1',
      [runId],
    )
    expect(run).toEqual({ layer_key: 'roads', status: 'succeeded' })
  })

  test('does not offer layer settings', async ({ page }) => {
    await page.goto('/staff/gis/imports')
    await expect(layerCard(page, 'roads')).toBeVisible()
    await expect(page.getByText('Layer settings')).toHaveCount(0)
  })
})

test.describe('layer settings and refresh as the administrator', () => {
  test.use({ role: 'admin' })

  test('saves settings and stores them on the layer', async ({ page, db }) => {
    await page.goto('/staff/gis/imports')
    const roads = layerCard(page, 'roads')
    await openDetails(roads, 'Layer settings')
    await roads.getByLabel('Mark stale after (days)').fill('91')
    await roads.getByLabel('Refresh every (hours)').fill('12')
    await roads.getByRole('button', { name: 'Save settings' }).click()
    await expectToast(page, 'Layer settings saved.')
    const layer = await db.one<{ stale_after_days: number; refresh_interval_hours: number }>(
      "select stale_after_days, refresh_interval_hours from gis_layers where key = 'roads'",
    )
    expect(layer).toEqual({ stale_after_days: 91, refresh_interval_hours: 12 })
  })

  test('refuses a mapping that is not valid beside the mapping field and keeps the old one', async ({
    page,
    db,
  }) => {
    await page.goto('/staff/gis/imports')
    const roads = layerCard(page, 'roads')
    await openDetails(roads, 'Layer settings')
    const mapping = roads.getByLabel('Field mapping (JSON)')
    await mapping.fill('{ not json')
    await roads.getByRole('button', { name: 'Save settings' }).click()
    await expectRefusedBeside(mapping, 'The mapping is not valid JSON for this layer.')
    const layer = await db.one<{ mapping: { sourceKey: string } }>(
      "select mapping from gis_layers where key = 'roads'",
    )
    expect(layer.mapping.sourceKey).toBe('ROAD_ID')
  })

  test('refreshing a remote layer with no source address says what to set first', async ({
    page,
    db,
  }) => {
    await page.goto('/staff/gis/imports')
    const water = layerCard(page, 'water')
    await openDetails(water, 'Layer settings')
    await water.getByLabel('Source', { exact: true }).selectOption('esri_rest')
    await water.getByRole('button', { name: 'Save settings' }).click()
    await expectToast(page, 'Layer settings saved.')
    const layer = await db.one<{ adapter: string }>(
      "select adapter from gis_layers where key = 'water'",
    )
    expect(layer.adapter).toBe('esri_rest')

    await page.goto('/staff/gis/imports')
    await water.getByRole('button', { name: 'Run import' }).click()
    await expect(water.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Set an Esri or AxisGIS adapter and a source URL first, or upload a file.',
    )
  })
})

test.describe('imports as an inspector', () => {
  test.use({ role: 'inspector' })

  test('sees no import or settings forms', async ({ page }) => {
    await page.goto('/staff/gis/imports')
    await expect(page.getByRole('button', { name: 'Run import' })).toHaveCount(0)
    await expect(page.getByText('Layer settings')).toHaveCount(0)
  })
})
