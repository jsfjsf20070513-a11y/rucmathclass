import { supabase } from './supabase'
import { withRequestDeadline } from './requestDeadline'
import { mergePicks, samePicks } from './lectureAnswerStorage'

// 同一天的作答共用一行。比较读到的版本，竞争写入时重读并逐题合并。
export async function syncLectureDay(userId, day, picks, signal, client = supabase) {
  if (!client) throw new Error('阅读答案服务未配置')
  const table = () => client.from('lecture_answers')
  const forDay = (q) => q.eq('user_id', userId).eq('day', day)
  const columns = 'answers,updated_at'
  const run = (query) => withRequestDeadline((s) => query.abortSignal(s).maybeSingle(), { signal })
  for (let attempt = 0; attempt < 4; attempt++) {
    signal.throwIfAborted()
    const { data: row, error } = await run(forDay(table().select(columns)))
    if (error) throw error
    const remote = mergePicks(row?.answers)
    const answers = mergePicks(remote, picks)
    if (samePicks(remote, answers)) return answers
    signal.throwIfAborted()
    const updated_at = new Date(Math.max(Date.now(), row ? Date.parse(row.updated_at) + 1 : 0)).toISOString()
    const write = row
      ? forDay(table().update({ answers, updated_at })).eq('updated_at', row.updated_at)
      : table().insert({ user_id: userId, day, answers, updated_at })
    const result = await run(write.select(columns))
    if (result.error && result.error.code !== '23505') throw result.error
    if (result.data) return mergePicks(result.data.answers)
  }
  throw new Error('同日答案正在其他设备上更新')
}
