import { modelEvents } from './modelStream.js'
import { runSiteTool, siteTools } from './chatTools.js'
import { maxOutputTokens, reserveUsage, settleUsage } from './chatUsage.js'
import { beijingDate } from './lectureStore.js'

const model = 'gpt-6.2-sol'

function siteContext(today) {
  return '这里是中法学院 2025 级数学班网站。今天是北京时间 ' + today + '。'
}

function responseText(output) {
  return output.filter(item => item.type === 'message').flatMap(item => item.content).map(part => {
    if (part.type === 'refusal') return part.refusal
    if (part.type !== 'output_text') return ''
    // 链接存为 Markdown，重开历史时仍能打开引文。
    const citations = (part.annotations || []).filter(a => a.type === 'url_citation' && /^https?:\/\//i.test(a.url))
    return part.text + citations.map((a, i) => ' [' + (i + 1) + '](<' + a.url.replaceAll('>', '%3E') + '>)').join('')
  }).join('\n')
}

export async function answerWithSol(contents, context, emit) {
  const { env, userId, signal } = context
  const input = contents.map(({ role, parts }) => ({
    role: role === 'model' ? 'assistant' : 'user',
    content: role === 'model' ? parts.map(p => p.text).join('') : parts.map(p => p.inlineData
      ? { type: 'input_image', image_url: 'data:' + p.inlineData.mimeType + ';base64,' + p.inlineData.data }
      : { type: 'input_text', text: p.text }),
  }))
  for (let round = 0; round < 6; round++) {
    signal.throwIfAborted()
    const today = beijingDate(Date.now())
    const tools = round < 5 ? [...siteTools] : []
    const ticket = await reserveUsage(env, { userId, today, input, tools, wantSearch: round < 5 })
    if (!ticket) throw new Error('额度不足')
    signal.throwIfAborted()
    if (ticket.search) tools.push({ type: 'web_search', search_context_size: 'low' })
    const instructions = siteContext(today) + (tools.length
      ? '可查定理、Parole、每日阅读、书目，以及提问者本人的答题记录和对话。' + (ticket.search ? '需要时可联网搜索。' : '') : '')
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', redirect: 'manual', signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.OPENAI_API_KEY },
      body: JSON.stringify({ model, input, tools, instructions, stream: true, store: false, include: ['reasoning.encrypted_content'],
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
    const calls = output.filter(item => item.type === 'function_call')
    if (!calls.length) {
      const text = responseText(output)
      if (!text.trim()) throw new Error('回复为空')
      return { model, text }
    }
    if (calls.length > 8 || !tools.length) break
    emit({ reset: true })
    input.push(...output)
    for (const call of calls) {
      signal.throwIfAborted()
      let value
      try { value = await runSiteTool(call, { ...context, today }) }
      catch { value = { error: '这次没能读取资料。' } }
      const outputText = JSON.stringify(value)
      input.push({ type: 'function_call_output', call_id: call.call_id,
        output: outputText.length > 100000 ? JSON.stringify({ error: '记录太多，请缩小查询范围。' }) : outputText })
    }
  }
  throw new Error('工具调用次数已满')
}
