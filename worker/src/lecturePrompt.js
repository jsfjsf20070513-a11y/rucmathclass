import { lectureSamples } from '../../src/data/lectureSamples.js'
import { bannedLecturePhrases } from '../../src/lib/lectureContent.js'

const text = { type: 'string' }
const list = (items) => ({ type: 'array', items })
const object = (properties) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
})
// Strict 模式要求每个对象的属性全部必填。两个封闭分支保留样稿里真正可省略的字段。
const optional = (fields, extra) => ({ anyOf: [object(fields), object({ ...fields, ...extra })] })
const points = list(optional({ term: text, note: text }, { star: { type: 'boolean' } }))
const question = optional({
  stem: text, options: list(object({ key: text, text })), answer: text, evidence: list(text),
}, { note: text })

export const lectureFormat = {
  type: 'json_schema', name: 'daily_lecture', strict: true,
  schema: object({
    date: text, level: { enum: ['B1', 'B2', 'C1'], type: 'string' },
    exam: { enum: ['DELF', 'DALF', 'TCF', 'TEF'], type: 'string' }, title: text,
    paragraphs: list(text), questions: list(question), titleNote: object({ zh: text, points }),
    sentences: list(object({ fr: text, zh: text, points })), takeaways: points,
  }),
}

// 八天一轮。DALF 对应 C1，其余天以 B2 为主，穿插 B1。
export function lectureAssignment(date) {
  const n = Math.floor(Date.parse(date) / 86_400_000)
  const exam = ['DELF', 'DALF', 'TCF', 'TEF'][n % 4]
  return { exam, level: exam === 'DALF' ? 'C1' : n % 8 === 0 ? 'B1' : 'B2' }
}

export const lectureInstructions = `为全班共同阅读写一篇原创法语短文。题材从日常生活、社会、文化、科学普及中选。避开数学法语，避开专讲应试技巧的文章，不抄真题。参照指定考试的阅读题型与难度出题。
标题、正文、题干、选项和题注用法语。每题只有一个正确答案。选项键用 A、B、C、D 或 Vrai、Faux。evidence 的每个片段必须逐字摘自正文的同一段，保留标点和大小写。
按正文顺序逐句写出法语原句和自然的中文翻译。讲解标题和每个句子，最后挑出本篇要记的词。每条要点的 term 是原文里的法语词或结构，note 用中文说清在这里是什么意思，必要时举一个短例。把生词和容易误读的表达讲全，让读者不用猜。常考用法给 star 填 true，其余省略 star。只有题目需要补充作答要求时才写题注。
说人话，一条讲一件事。全文用纯文本，不用 Markdown 符号、表情、套话或语法书术语。禁用这些说法：${bannedLecturePhrases.join('、')}。
下面是一篇完整样稿。参照它的语气和讲解密度，另写新题材。
${JSON.stringify(lectureSamples[2])}`

export function lectureRequest(date, model, recentTitles) {
  const { exam, level } = lectureAssignment(date)
  return {
    model, reasoning: { effort: 'high' }, background: true,
    background_options: { completion_window: '8h' }, service_tier: 'default',
    text: { format: lectureFormat }, instructions: lectureInstructions,
    input: `写 ${date} 的阅读，题型为 ${exam}，难度为 ${level}。最近三十天的标题如下，请选不同的题材和标题。\n${JSON.stringify(recentTitles)}`,
  }
}
