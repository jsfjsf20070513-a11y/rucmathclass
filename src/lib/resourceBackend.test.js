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

it('retains old editions and labels known books by URL or id without exposing descriptions', async () => {
  const legacy = staticResourceCatalog.map(book => ({ ...book, subject: undefined, description: '原来的整句介绍。' }))
  legacy[0].id = 'renamed'
  legacy[1].url = 'https://publisher.org/moved'
  const unknown = legacy.find(book => book.id === 'mit-complex')
  Object.assign(unknown, { id: 'another-book', url: 'https://publisher.org/another' })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(legacy)))
  const books = await fetchPublishedResources()
  expect(books.map(book => book.id)).toEqual(legacy.map(book => book.id))
  expect(books[0].subject).toBe('常微分方程')
  expect(books[1].subject).toBe('实分析')
  expect(books.find(book => book.id === 'another-book').subject).toBe('')
  expect(books.every(book => !('description' in book))).toBe(true)
})
