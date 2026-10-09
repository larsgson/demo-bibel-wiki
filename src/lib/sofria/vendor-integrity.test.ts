import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The files under ./vendor are bcv-commons/bibles' reference renderer, copied
// unmodified. Changes belong upstream; update with `npm run sync:sofria`.
const VENDOR_DIR = join(__dirname, 'vendor')
const manifest = JSON.parse(readFileSync(join(VENDOR_DIR, 'VENDOR.json'), 'utf8')) as {
  commit: string
  files: Record<string, { upstream: string; sha256: string }>
}

describe('vendored sofria-render', () => {
  it('pins a full commit sha', () => {
    expect(manifest.commit).toMatch(/^[0-9a-f]{40}$/)
  })

  it.each(Object.entries(manifest.files))('%s is unmodified', (local, { sha256 }) => {
    const got = createHash('sha256').update(readFileSync(join(VENDOR_DIR, local))).digest('hex')
    expect(got, `${local} was edited — vendored files must match upstream`).toBe(sha256)
  })
})
