import { lectureAssignment } from '../../worker/src/lecturePrompt.js'
import { dayMs, isLectureDate } from '../../worker/src/lectureStore.js'

export function schedule(start, count) {
  if (!isLectureDate(start)) throw new Error('起始日期须为有效的 YYYY-MM-DD。')
  const first = Date.parse(start)
  if (!Number.isSafeInteger(count) || count < 1 || first + (count - 1) * dayMs > Date.parse('9999-12-31')) {
    throw new Error('天数须为正整数，且最后一天不能超过 9999-12-31。')
  }
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(first + i * dayMs).toISOString().slice(0, 10)
    return { date, ...lectureAssignment(date) }
  })
}

export function checkPlan(plan, slots) {
  const days = plan?.days
  if (!Array.isArray(days) || !days.length) throw new Error('题材表缺少日期。')
  const expected = slots ?? schedule(days[0]?.date, days.length)
  if (days.length !== expected.length) throw new Error('题材表的天数与批次不符。')
  for (const [i, { date, exam, level }] of expected.entries()) {
    const day = days[i]
    if (day?.date !== date || day.exam !== exam || day.level !== level) {
      throw new Error(`题材表第 ${i + 1} 天应为 ${date} ${exam} ${level}。`)
    }
    if (![day.theme, day.angle].every((s) => typeof s === 'string' && s.trim())) {
      throw new Error(`${date} 缺少题材或出题重心。`)
    }
  }
}

const fields = ['date', 'exam', 'level', 'theme', 'angle']
export const planSchema = {
  type: 'object', additionalProperties: false, required: ['days'],
  properties: { days: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: fields,
    properties: Object.fromEntries(fields.map((name) => [name, { type: 'string' }])),
  } } },
}

export function planPrompt(slots, recentTitles) {
  return `为准备法语 B2 考试的中国大学生安排 ${slots.length} 天的阅读题材。
在日常生活、城市、文化、科学、工作、学习、环境、饮食、交通、体育和手工之间轮换。
每篇围绕一个具体场景中的变化或决定。B1 选生活情境。C1 可写人物观点或需要推断的细节。
避开数学、应试技巧、时政和宗教争议。故事不限定具体年份。
theme 用 30 个中文字以内写清场景和变化。angle 用一句中文写出读者需要理解什么。
避开这些近期标题已经写过的题材：${JSON.stringify(recentTitles)}
按以下顺序逐日填写，保留日期、考试和难度：
${slots.map(({ date, exam, level }) => `${date} ${exam} ${level}`).join('\n')}`
}
