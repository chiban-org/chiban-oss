import { describe, expect, it } from 'vitest'
import { envSchema } from '@/config/env'
import { readDeployFile } from './composeText'

const toml = readDeployFile('garage.toml')
const s3Section = toml.split('[s3_api]')[1]?.split(/^\[/m)[0] ?? ''
const adminSection = toml.split('[admin]')[1]?.split(/^\[/m)[0] ?? ''
const defaultRegion = envSchema.shape.S3_REGION.parse(undefined)

describe('garage.toml', () => {
  it('is a single node without replication', () => {
    expect(toml).toMatch(/^replication_factor = 1$/m)
  })

  it('uses sqlite metadata with fsync on, because one node cannot rebuild metadata from a peer', () => {
    expect(toml).toMatch(/^db_engine = "sqlite"$/m)
    expect(toml).toMatch(/^metadata_fsync = true$/m)
    expect(toml).toMatch(/^data_fsync = true$/m)
  })

  it('keeps metadata and data under the one mounted volume', () => {
    expect(toml).toMatch(/^metadata_dir = "\/var\/lib\/garage\/meta"$/m)
    expect(toml).toMatch(/^data_dir = "\/var\/lib\/garage\/data"$/m)
  })

  it('signs S3 requests in the region the app defaults to', () => {
    expect(s3Section).toContain(`s3_region = "${defaultRegion}"`)
    expect(s3Section).toContain('api_bind_addr = "[::]:3900"')
  })

  it('serves the admin API on 3903', () => {
    expect(adminSection).toContain('api_bind_addr = "[::]:3903"')
  })

  it('holds no secret, which comes from the environment instead', () => {
    expect(toml).not.toMatch(/rpc_secret|admin_token|metrics_token/)
  })
})
