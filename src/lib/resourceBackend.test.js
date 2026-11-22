import { afterEach, expect, it, vi } from 'vitest'
import { staticResourceCatalog } from '../data/resourceCatalog'
import { fetchPublishedResources } from './resourceBackend'

afterEach(() => vi.unstubAllGlobals())

it('reads the complete Worker catalogue without merging static entries into it', async () => {
  const updated = staticResourceCatalog.slice(1)
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(updated)))
  expect(await fetchPublishedResources()).toEqual(updated)
  expect(fetch).toHaveBeenCalledWith('/api/resources', { signal: expect.any(AbortSignal) })
})

it.each([() => new Response(null, { status: 503 }), () => Response.json([])])('rejects unavailable and malformed responses', async response => {
  vi.stubGlobal('fetch', vi.fn(response))
  await expect(fetchPublishedResources()).rejects.toThrow()
})
