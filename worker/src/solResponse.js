import { modelEvents } from './modelStream.js'
import { maxOutputTokens, reserveUsage, settleUsage } from './chatUsage.js'
import { beijingDate } from './lectureStore.js'

export const model = 'gpt-6.2-sol'

export async function requestSol({ env, userId, signal, input, tools = [], instructions,
  wantSearch, requireSearch = false, emit = () => {} }) {
  const today = beijingDate(Date.now())
  const ticket = await reserveUsage(env, { userId, today, input, tools, wantSearch })
  if (!ticket) return null
  if (requireSearch && !ticket.search) {
    await settleUsage(env, ticket, { input_tokens: 0, output_tokens: 0 }, 0)
    return null
  }
  signal.throwIfAborted()
  if (ticket.search) tools.push({ type: 'web_search', search_context_size: 'low' })
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', redirect: 'manual', signal,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.OPENAI_API_KEY },
    body: JSON.stringify({ model, input, tools, instructions: instructions + (ticket.search ? '可联网搜索。' : ''),
      ...(requireSearch && { tool_choice: { type: 'web_search' } }), stream: true, store: false, include: ['reasoning.encrypted_content'],
      reasoning: { effort: 'low' }, service_tier: 'default', max_tool_calls: 1, max_output_tokens: maxOutputTokens }),
  })
  if (!response.ok) {
    await response.body?.cancel()
    // 参数、权限及限流拒绝没有启动生成。网络断开或 5xx 的用量仍按预留计算。
    if ([400, 401, 403, 404, 429].includes(response.status)) await settleUsage(env, ticket, { input_tokens: 0, output_tokens: 0 }, 0)
    throw new Error('Responses 请求失败')
  }
  let result
  for await (const event of modelEvents(response.body)) {
    if (['response.output_text.delta', 'response.refusal.delta'].includes(event.type)) emit({ delta: event.delta })
    if (event.type === 'response.completed' || event.type === 'response.incomplete' || event.type === 'response.failed') {
      result = event.response
      break
    }
    if (event.type === 'error') break
  }
  if (!result) throw new Error('Responses 连接中断')
  const output = result.output || []
  await settleUsage(env, ticket, result.usage, output.filter(item => item.type === 'web_search_call').length)
  if (result.status !== 'completed') throw new Error('回复未完成')
  if (requireSearch && !output.some(item => item.type === 'web_search_call' && item.status === 'completed')) {
    throw new Error('联网搜索未完成')
  }
  return output
}
