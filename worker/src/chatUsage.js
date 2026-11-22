// 所有金额以百万分之一美元计。余额校验与扣款必须在同一笔预留内完成。
export const monthlyBudget = 60_000_000
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

export async function reserveUsage(env, { userId, today, input, tools, wantSearch }) {
  const store = env.CHAT_USAGE
  if (!store || !env.LECTURE) return null
  const month = today.slice(0, 7)
  const ledger = store.get(store.idFromName(month))
  const ticket = await ledger.reserve({ userId, today, inputTokens: reserveTokens(input, tools), wantSearch })
  if (!ticket) return null
  // 每次预留、结算各用一个新键，避开 KV 单键每秒一次的写入限制。
  const key = 'usage:' + month + ':' + ticket.id
  try {
    await env.LECTURE.put(key + ':reserve', JSON.stringify({ day: today, search: ticket.search,
      reservedMicros: ticket.amount, monthCommittedMicros: ticket.monthMicros }))
  } catch (error) {
    // 尚未向模型发送请求，可以安全释放这笔预留。
    await ledger.settle(ticket.id, { amount: 0, searches: 0 })
    throw error
  }
  return { ...ticket, month, key }
}

export async function settleUsage(env, ticket, usage, searches) {
  const charge = usageCharge(usage, searches)
  if (!charge) return
  await env.LECTURE.put(ticket.key + ':settle', JSON.stringify({ inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens, searches, costMicros: charge.amount }))
  await env.CHAT_USAGE.get(env.CHAT_USAGE.idFromName(ticket.month)).settle(ticket.id, charge)
}
