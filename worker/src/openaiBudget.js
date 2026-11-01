import { createRequestScope } from './requestScope.js'

// OpenAI 花费计数，存在 Cloudflare KV（绑定名 AI_QUOTA）。不限个人次数，
// 只限全站花费：每天一道、每个计费周期一道。发请求前先按最坏情况占额，
// 回答后按实际用量多退少补，同时在路上的请求也算进账里。
// 超额、未配置或读写失败时不用 OpenAI，改由 Gemini 回答，不让同学看到报错。
// KV 没有原子加减：同一实例内的占额和结账排队执行；不同实例、不同机房之间
// 仍可能同时放行，所以计数是软上限。OpenAI 后台不绑卡才是硬上限。

const DAY_MS = 24 * 3600 * 1000
const SHANGHAI_OFFSET_MS = 8 * 3600 * 1000

function positive(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

// 北京时间的日期，形如 2026-11-01。
export function shanghaiDate(now) {
  return new Date(now + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10)
}

// 计费周期按订阅续费日（1–28 号）切分，返回周期开始的年月，形如 2026-11。
export function billingPeriod(now, resetDay) {
  const day = Math.min(28, Math.max(1, Math.floor(positive(resetDay, 1))))
  const date = new Date(now + SHANGHAI_OFFSET_MS)
  let year = date.getUTCFullYear()
  let month = date.getUTCMonth()
  if (date.getUTCDate() < day) {
    month -= 1
    if (month < 0) { month = 11; year -= 1 }
  }
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

// 同一实例内的读写排成一队，避免并发请求读到同一个旧数。
let ledgerQueue = Promise.resolve()
function serialized(operation) {
  const result = ledgerQueue.then(operation)
  ledgerQueue = result.catch(() => {})
  return result
}

const micros = (usd) => Math.ceil(usd * 1e6)
const readMicros = async (kv, key) => Number(await kv.get(key)) || 0

// 两道上限都够就占额并返回结账函数；不够或出错返回 null。
export async function reserveOpenAI({ env, userId, reserveUsd, signal, now = Date.now() }) {
  const kv = env.AI_QUOTA
  if (!kv || typeof kv.get !== 'function' || !userId) return null
  const reserved = micros(reserveUsd)
  const ledgers = [
    { key: `spend-day:${shanghaiDate(now)}`, limit: micros(positive(env.OPENAI_DAILY_BUDGET_USD, 3)), ttl: 2 * DAY_MS },
    { key: `spend:${billingPeriod(now, env.OPENAI_BUDGET_RESET_DAY)}`, limit: micros(positive(env.OPENAI_PERIOD_BUDGET_USD, 20)), ttl: 40 * DAY_MS },
  ]
  const add = (delta, spent) => Promise.all(ledgers.map(({ key, ttl }, index) => (
    kv.put(key, String(Math.max(0, spent[index] + delta)), { expirationTtl: ttl / 1000 }))))
  const read = () => Promise.all(ledgers.map(({ key }) => readMicros(kv, key)))
  const scope = createRequestScope(signal, 2000)
  try {
    const allowed = await scope.run(() => serialized(async () => {
      const spent = await read()
      if (ledgers.some(({ limit }, index) => spent[index] + reserved > limit)) return false
      await add(reserved, spent)
      return true
    }))
    if (!allowed) return null
  } catch {
    return null
  } finally { scope.close() }
  return async function settle(actualUsd) {
    const delta = micros(Math.max(0, actualUsd)) - reserved
    if (delta) await serialized(async () => add(delta, await read()))
  }
}
