import { getDailyContent } from './dailyStore.js'
import { readResources } from './resourceStore.js'
import { firstLectureDate, isLectureDate, lectureIndex } from './lectureStore.js'

const dateArg = '北京时间的 YYYY-MM-DD，留空表示今天。'
function tool(name, description, fields) {
  const properties = Object.fromEntries(Object.entries(fields).map(([key, hint]) =>
    [key, { type: ['string', 'null'], description: hint }]))
  return { type: 'function', name, description, strict: true, parameters: {
    type: 'object', properties, additionalProperties: false, required: Object.keys(fields),
  } }
}

export const siteTools = [
  tool('theorem', '查当天的定理、公式和讲解。', { date: dateArg }),
  tool('parole', '查指定日期首页展示的 Parole。', { date: dateArg }),
  tool('lecture', '查已发布的每日阅读。日期留空时列出最近的文章。', { date: '要读全文的日期，或 null。' }),
  tool('resources', '按关键词查班级书架，留空列出全部书目。', { query: '书名、学科或用途。' }),
  tool('my_answers', '查提问者的阅读作答，含原题、所选选项和正确答案。每次最多返回所选时段内最近 31 个作答日。', {
    from: '起始日期，含当天。', to: '结束日期，含当天。',
  }),
  tool('my_chats', '查提问者最近的对话，或按对话 ID 读取消息。', { conversation_id: '对话 ID，留空时列出最近的对话。' }),
]

function checkedDate(value) {
  if (!isLectureDate(value)) throw new Error('无效日期')
  return value
}

export async function runSiteTool(call, { env, today, userId, authorization, signal }) {
  const args = JSON.parse(call.arguments)
  const readDay = date => date >= firstLectureDate && date <= today
    ? env.LECTURE.get('day:' + date, 'json') : null
  async function ownRows(table, filters) {
    const url = new URL('/rest/v1/' + table, env.SUPABASE_URL)
    url.search = new URLSearchParams({ ...filters, user_id: 'eq.' + userId })
    const response = await fetch(url.href, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization },
      signal, redirect: 'manual' })
    if (!response.ok) throw new Error('读取记录失败')
    return response.json()
  }

  switch (call.name) {
    case 'theorem':
    case 'parole': {
      const day = await getDailyContent(env, args.date ?? today)
      if (!day) return null
      if (call.name === 'parole') return { date: day.date, ...day.parole }
      const { title, prelude, fallback, note } = day.theorem
      return { date: day.date, title, prelude, formula: fallback, note }
    }
    case 'resources': {
      const query = (args.query || '').trim().toLowerCase()
      return (await readResources(env)).filter(item =>
        [item.title, item.category, item.description].join(' ').toLowerCase().includes(query))
        .map(({ title, category, url, description, access }) => ({ title, category, url, description, access }))
    }
    case 'lecture':
      return args.date ? readDay(checkedDate(args.date)) : (await lectureIndex(env.LECTURE, today)).slice(-31)
    case 'my_answers': {
      const from = checkedDate(args.from || firstLectureDate)
      const to = checkedDate(args.to || today)
      const rows = await ownRows('lecture_answers', { select: 'day,answers', and: '(day.gte.' + from + ',day.lte.' + to + ')',
        order: 'day.desc', limit: '31' })
      return Promise.all(rows.map(async ({ day, answers }) => {
        const article = await readDay(day)
        return { day, title: article?.title, answers: Object.entries(answers).map(([i, value]) => {
          const question = article?.questions?.[i]
          return { number: Number(i) + 1, picked: value.key ?? value, question: question?.stem, options: question?.options, correct: question?.answer }
        }) }
      }))
    }
    case 'my_chats':
      if (!args.conversation_id) return ownRows('ai_conversations', { select: 'id,title,updated_at', order: 'updated_at.desc', limit: '30' })
      if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(args.conversation_id)) throw new Error('无效对话')
      return (await ownRows('ai_messages', { select: 'role,content,created_at', conversation_id: 'eq.' + args.conversation_id,
        order: 'created_at.desc,id.desc', limit: '20' })).reverse()
    default:
      throw new Error('工具不存在')
  }
}
