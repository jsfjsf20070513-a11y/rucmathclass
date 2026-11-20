import { lectureProblems } from '../../src/lib/lectureContent.js'
import { lectureAssignment, lectureRequest } from './lecturePrompt.js'
import { beijingDate, dayMs, lectureIndex, lectureSummary, listLectureKeys } from './lectureStore.js'

const api = 'https://api.openai.com/v1/responses'
const modelAt = (index) => index < 3 ? 'gpt-6.2-astra' : 'gpt-6.2-sol'

async function openai(env, id, body) {
  const response = await fetch(id ? `${api}/${encodeURIComponent(id)}` : api, {
    method: id ? 'GET' : 'POST', redirect: 'manual', signal: AbortSignal.timeout(25_000),
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  })
  if (!response.ok) throw Object.assign(new Error(`Responses HTTP ${response.status}`), { status: response.status })
  return response.json()
}

function extractDay(response, date, recentTitles) {
  const text = response.output?.filter((item) => item.type === 'message')
    .flatMap((message) => message.content || []).filter((part) => part.type === 'output_text')
    .map((part) => part.text).join('')
  let day
  try { day = JSON.parse(text) } catch { return { problems: ['未收到可解析的文章 JSON'] } }
  const problems = lectureProblems(day)
  const { level, exam } = lectureAssignment(date)
  if (day?.date !== date) problems.push('文章日期与任务不符')
  if (day?.level !== level || day?.exam !== exam) problems.push('难度或考试与当天安排不符')
  if (recentTitles.includes(day?.title)) problems.push('标题与最近三十天重复')
  return { day, problems }
}

async function finish(kv, date, status, failures) {
  if (failures.length) await kv.put(`result:${date}`, JSON.stringify({ status, failures }))
  await kv.delete(`pending:${date}`)
}

async function advance(env, date, now) {
  const kv = env.LECTURE
  const key = `pending:${date}`
  const pending = await kv.get(key, 'json')
  if (await kv.get(`day:${date}`)) {
    // 上次可能已发布正文，但尚未收好诊断记录。
    if (pending) await finish(kv, date, 'published', pending.failures)
    return
  }
  if (await kv.get(`result:${date}`)) {
    if (pending) await kv.delete(key)
    return
  }
  const failures = pending?.failures || []
  const model = modelAt(failures.length)
  const id = pending?.id
  let titles = pending?.titles
  if (!titles) {
    const from = beijingDate(Date.parse(date) - 30 * dayMs)
    titles = (await lectureIndex(kv, date, from)).map(({ title }) => title)
  }
  const started = id ? pending.started : now
  let response, problems
  try {
    response = await openai(env, id, id ? undefined : lectureRequest(date, model, titles))
  } catch (error) {
    const reason = error.status ? error.message : 'Responses 请求未取得有效响应'
    // 短暂断网或限流后继续查原 id，避免重复创建。一天后仍无结果才换一次尝试。
    if (id && (!error.status || error.status === 429 || error.status >= 500) && now - started < dayMs) {
      if (pending.pollError !== reason) await kv.put(key, JSON.stringify({ ...pending, pollError: reason }))
      return
    }
    problems = [reason]
  }
  if (!problems && (response?.status === 'queued' || response?.status === 'in_progress')) {
    if (!id && response.id) {
      await kv.put(key, JSON.stringify({ failures, id: response.id, started, titles }))
      return
    }
    if (id && now - started < dayMs) return
    problems = [id ? '超过一天仍未完成' : '创建任务未返回 response id']
  }
  if (!problems && response?.status === 'completed') {
    const result = extractDay(response, date, titles)
    if (!result.problems.length) {
      await kv.put(`day:${date}`, JSON.stringify(result.day), { metadata: lectureSummary(result.day) })
      await finish(kv, date, 'published', failures)
      return
    }
    problems = result.problems
  }
  if (!problems) problems = [`Responses ${response?.status || '无状态'}：${response?.error?.code || response?.incomplete_details?.reason || '无错误码'}`]
  failures.push({ model, id: id || response?.id || null, at: new Date(now).toISOString(), problems })
  if (failures.length >= 5) await finish(kv, date, 'abandoned', failures)
  else await kv.put(key, JSON.stringify({ failures }))
}

export async function generateLectures(env, now) {
  const pending = await listLectureKeys(env.LECTURE, 'pending:')
  const dates = new Set([beijingDate(now + dayMs), ...pending.map(({ name }) => name.slice('pending:'.length))])
  // 凌晨先开明天的任务，也继续查昨天已经提交的任务。
  for (const date of dates) await advance(env, date, now)
}
