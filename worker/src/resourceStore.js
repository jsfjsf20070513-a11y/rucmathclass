import { staticResourceCatalog } from '../../src/data/resourceCatalog.js'
import { validateCatalog } from '../../src/lib/resourcePolicy.js'

export const catalogKey = 'resources:current'
const backupPrefix = 'resources:backup:'
const seed = { revision: 'seed', previous: null, week: null, backups: [], items: staticResourceCatalog }

export async function resourceState(kv) {
  const state = await kv.get(catalogKey, 'json')
  if (state === null) return seed
  validateCatalog(state.items)
  if (typeof state.revision !== 'string' || !Array.isArray(state.backups)) throw new Error('书目版本无效')
  return state
}

export async function readResources(env) {
  try { return (await resourceState(env.LECTURE)).items }
  catch { return staticResourceCatalog }
}

// 若切换版本后清理请求中断，下次周更或回滚可从当前版本取回待删编号。
export async function pruneBackups(kv, state) {
  for (const id of state.expired || []) await kv.delete(backupPrefix + id)
}

// 留底先成功，再一次写入当前书目和八份留底的索引。出版失败时仍能读取旧版。
// 版本号也是备份键，重试同一次出版不会多留一份。
export async function publishResources(kv, old, items, week, previous = old.revision) {
  validateCatalog(items)
  const latest = await resourceState(kv)
  if (latest.revision !== old.revision) throw new Error('更新期间书目已变化')
  await pruneBackups(kv, old)
  const backups = [old.revision, ...old.backups].slice(0, 8)
  const state = { revision: crypto.randomUUID(), previous, backups, expired: old.backups.slice(7), week, items }
  await kv.put(backupPrefix + old.revision, JSON.stringify({
    revision: old.revision, previous: old.previous, items: old.items,
  }))
  await kv.put(catalogKey, JSON.stringify(state))
  await pruneBackups(kv, state)
  return state
}

export async function rollbackResources(kv) {
  const old = await resourceState(kv)
  if (!old.previous || !old.backups.includes(old.previous)) throw new Error('没有更早的留底')
  const previous = await kv.get(backupPrefix + old.previous, 'json')
  if (previous?.revision !== old.previous) throw new Error('未能读取上一份留底')
  return publishResources(kv, old, previous.items, old.week, previous.previous)
}
