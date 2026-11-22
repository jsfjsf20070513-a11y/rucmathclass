import { model, requestSol } from './solResponse.js'
import { runSiteTool, siteTools } from './chatTools.js'
import { beijingDate } from './lectureStore.js'


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
    const instructions = siteContext(today) + (tools.length
      ? '可查定理、Parole、每日阅读、书目，以及提问者本人的答题记录和对话。推荐学习资料时先查班级书架。' : '')
    const output = await requestSol({ env, userId, signal, input, tools, instructions, wantSearch: round < 5, emit })
    if (!output) throw new Error('额度不足')
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
