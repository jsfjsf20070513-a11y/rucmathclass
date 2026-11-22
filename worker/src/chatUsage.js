// 所有金额以百万分之一美元计。
export const monthlyBudget = 55_000_000
export const dailySearchLimit = 10
export const maxOutputTokens = 4096
const searchFee = 10_000

// Sol Standard。输入按缓存写入费率保守估算，缓存命中也不打折。
// 输入长度不明（图片）时使用模型的输入上限；输出含推理 token。
export function estimateCost(inputTokens, outputTokens, searches) {
  const long = inputTokens > 272000
  return Math.ceil(inputTokens * (long ? 5 : 2.5) + outputTokens * (long ? 15 : 10) + searches * searchFee)
}

function reserveTokens(input, tools) {
  const hasImage = input.some(item => Array.isArray(item.content) && item.content.some(p => p.type === 'input_image'))
  if (hasImage) return 922000
  // UTF-8 字节数覆盖文本分词，另留消息封装和系统指令空间。
  return Math.min(922000, new TextEncoder().encode(JSON.stringify([input, tools])).length + 4096)
}

export function planUsage({ spent, searches, inputTokens, wantSearch }) {
  // 每轮只给一次内置工具调用；一并预留搜索结果的上下文。
  const search = wantSearch && searches < dailySearchLimit
  const amount = estimateCost(Math.min(922000, inputTokens + (search ? 128000 : 0)), maxOutputTokens, Number(search))
  if (spent + amount > monthlyBudget) return null
  return { amount, search }
}

export function usageCharge(usage, searches) {
  if (!Number.isSafeInteger(usage?.input_tokens) || usage.input_tokens < 0 ||
      !Number.isSafeInteger(usage?.output_tokens) || usage.output_tokens < 0) return null
  return { amount: estimateCost(usage.input_tokens, usage.output_tokens, searches), searches }
}

// 两条记录可能分属不同的列表页，也可能先看到结算。每个请求只计一次。
async function monthUsage(kv, prefix, today, userId) {
  const requests = new Map()
  let cursor
  do {
    const page = await kv.list({ prefix, cursor })
    for (const { name, metadata } of page.keys) {
      const id = name.slice(prefix.length, name.lastIndexOf(':'))
      const settled = name.endsWith(':settle')
      if (requests.has(id) && !settled) continue
      const entry = metadata ?? await kv.get(name, 'json')
      const amount = settled ? entry?.costMicros : entry?.reservedMicros
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('无法读取本月用量')
      const searches = entry.day === today && entry.userId === userId
        ? (settled ? entry.searches : Number(entry.search)) : 0
      requests.set(id, { amount, searches })
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  let spent = 0
  let searches = 0
  for (const entry of requests.values()) {
    spent += entry.amount
    searches += entry.searches
  }
  return { spent, searches }
}

function recordUsage(kv, key, entry) {
  return kv.put(key, JSON.stringify(entry), { metadata: entry })
}

export async function reserveUsage(env, { userId, today, input, tools, wantSearch }) {
  const prefix = 'usage:' + today.slice(0, 7) + ':'
  const totals = await monthUsage(env.LECTURE, prefix, today, userId)
  const plan = planUsage({ ...totals, inputTokens: reserveTokens(input, tools), wantSearch })
  if (!plan) return null
  const key = prefix + crypto.randomUUID()
  await recordUsage(env.LECTURE, key + ':reserve', { day: today, userId, search: plan.search, reservedMicros: plan.amount })
  return { key, day: today, userId, search: plan.search }
}

export async function settleUsage(env, ticket, usage, searches) {
  const charge = usageCharge(usage, searches)
  if (!charge) return
  await recordUsage(env.LECTURE, ticket.key + ':settle', { day: ticket.day, userId: ticket.userId,
    inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, searches, costMicros: charge.amount })
}
