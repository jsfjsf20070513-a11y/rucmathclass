import { createRequestScope } from './requestScope.js'

// OpenAI 的次数与花费计数，存在 Cloudflare KV（绑定名 AI_QUOTA）。
// 每个账号每天限次数；每个计费周期限总花费。超出、未配置或读写失败时
// 不用 OpenAI，改由 Gemini 回答，不让同学看到报错。
// KV 跨机房同步有延迟，计数是软上限；OpenAI 后台不绑卡才是硬上限。

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

export function openaiLimits(env) {
  return {
    daily: Math.floor(positive(env.OPENAI_DAILY_PER_USER, 20)),
    budgetMicros: Math.round(positive(env.OPENAI_PERIOD_BUDGET_USD, 80) * 1e6),
    resetDay: env.OPENAI_BUDGET_RESET_DAY,
  }
}

const readCount = async (kv, key) => Number(await kv.get(key)) || 0

// 名额够就先占一次并返回记账函数；不够或出错返回 null。
export async function reserveOpenAI({ env, userId, signal, now = Date.now() }) {
  const kv = env.AI_QUOTA
  if (!kv || typeof kv.get !== 'function' || !userId) return null
  const { daily, budgetMicros, resetDay } = openaiLimits(env)
  const dayKey = `day:${shanghaiDate(now)}:${userId}`
  const spendKey = `spend:${billingPeriod(now, resetDay)}`
  const scope = createRequestScope(signal, 2000)
  try {
    const [used, spent] = await scope.run(() => Promise.all([readCount(kv, dayKey), readCount(kv, spendKey)]))
    if (used >= daily || spent >= budgetMicros) return null
    await scope.run(() => kv.put(dayKey, String(used + 1), { expirationTtl: 2 * DAY_MS / 1000 }))
  } catch {
    return null
  } finally { scope.close() }
  return async function recordSpend(costUsd) {
    const micros = Math.ceil(costUsd * 1e6)
    if (!(micros > 0)) return
    const spent = await readCount(kv, spendKey)
    await kv.put(spendKey, String(spent + micros), { expirationTtl: 40 * DAY_MS / 1000 })
  }
}
