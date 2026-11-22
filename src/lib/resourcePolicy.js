import { resourceCategories, staticResourceCatalog } from '../data/resourceCatalog.js'

export const protectedResourceIds = [
  'su-analysis', 'strogatz-chaos', 'strang-linear', 'axler-linear',
  'gross-algebra', 'tokieda-topology', 'blitzstein-probability', 'green-book',
]

const shelves = resourceCategories.map(shelf => shelf.label)
const blockedHosts = /(?:^|\.)(?:localhost|local|internal|test|invalid|onion|nip\.io|sslip\.io|drive\.google\.com|docs\.google\.com|dropbox\.com|dropboxusercontent\.com|pan\.baidu\.com|pan\.quark\.cn|aliyundrive\.com|alipan\.com|mega\.nz|1drv\.ms|onedrive\.live\.com|mediafire\.com|scribd\.com|z-lib\.[a-z]+|libgen\.[a-z]+)$/

export function publicResourceUrl(raw) {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(url.hostname) || blockedHosts.test(url.hostname) ||
      /\/(?:login|signin|sign-in|paywall|download)(?:\/|$)|\.(?:exe|dmg|zip|rar|torrent)$/i.test(url.pathname)) {
    throw new Error('书目链接不符合收录要求')
  }
  return url
}

export function linkIdentity(raw) {
  const url = publicResourceUrl(raw)
  for (const name of [...url.searchParams.keys()]) {
    if (/^utm_|^(?:fbclid|gclid)$/i.test(name)) url.searchParams.delete(name)
  }
  url.searchParams.sort()
  return url.href.replace(/^https:\/\/(?:www\.)?/, '').replace(/\/(?=[?#]|$)/, '')
}

export function validateCatalog(items) {
  if (!Array.isArray(items) || items.length > 36) throw new Error('全站最多收录 36 条')
  const ids = new Set(), urls = new Set(), titles = new Set()
  const counts = new Map(shelves.map(label => [label, 0]))
  for (const item of items) {
    if (!item || !counts.has(item.category) || typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(item.id) ||
        !['免费', '付费'].includes(item.access) || typeof item.url !== 'string' || item.url.length > 2048 ||
        typeof item.title !== 'string' || !item.title.trim() || item.title.length > 160 ||
        typeof item.description !== 'string' || item.description.length > 160 || !/\p{Script=Han}/u.test(item.description)) {
      throw new Error('书目字段无效')
    }
    const url = linkIdentity(item.url)
    const title = item.title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
    if (ids.has(item.id) || urls.has(url) || titles.has(title)) throw new Error('书目重复')
    ids.add(item.id)
    urls.add(url)
    titles.add(title)
    counts.set(item.category, counts.get(item.category) + 1)
  }
  if ([...counts.values()].some(n => n < 1 || n > 6)) throw new Error('每架须有一至六条')
  for (const id of protectedResourceIds) {
    const original = staticResourceCatalog.find(item => item.id === id)
    const current = items.find(item => item.id === id)
    if (!current || current.category !== original.category || current.title !== original.title || current.access !== original.access || current.textbookUrl !== original.textbookUrl) {
      throw new Error('须保留受保护书目：' + id)
    }
  }
  return items
}
