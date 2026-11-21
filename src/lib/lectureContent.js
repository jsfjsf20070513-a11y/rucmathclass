// 每日阅读内容的入库检查。页面按纯文本渲染，所以 Markdown 符号、表情、
// 套话和语法书黑话一旦混进来，就会原样出现在页面上。生成后先过这里，有问题就重新生成。

const MARKDOWN = /\*\*|__|`|^#{1,6}\s|^\s*[-*+]\s|\[[^\]]*\]\([^)]*\)|⭐/m
const EMOJI = /\p{Extended_Pictographic}/u
export const bannedLecturePhrases = [
  // 防御性和套话
  '仅供参考', '请自行核对', '需要注意的是', '值得注意的是', '值得一提的是', '请注意',
  '温馨提示', '总而言之', '综上所述', '希望对你有帮助', '作为AI', '作为 AI',
  // 语法书黑话：要换成人话
  '赘词', '副动词', '无人称结构', '先行词', '直宾', '间宾', '配合成',
]

function textProblems(text, where) {
  const problems = []
  if (typeof text !== 'string' || !text.trim()) return [`${where}：内容为空`]
  if (MARKDOWN.test(text)) problems.push(`${where}：含 Markdown 符号`)
  if (EMOJI.test(text)) problems.push(`${where}：含表情符号`)
  for (const phrase of bannedLecturePhrases) {
    if (text.includes(phrase)) problems.push(`${where}：含「${phrase}」`)
  }
  return problems
}

// 讲解和译文是完整的句子，必须以标点收尾。模型偶尔会在句号后面多吐出几个无关的词，
// 比如「……我坐公交车。电影院」，或者「。,」，这类尾巴要拦下来重写。
const SENTENCE_END = /[。！？…）」”)!?.»]$/
function endingProblems(text, where) {
  if (typeof text !== 'string' || !text.trim()) return []
  const trimmed = text.trim()
  return SENTENCE_END.test(trimmed) && !/[。！？][,，、]$/.test(trimmed) ? [] : [`${where}：结尾多出了字或标点`]
}

function pointProblems(points, where) {
  if (!Array.isArray(points) || !points.length) return [`${where}：没有要点`]
  return points.flatMap((point, index) => [
    ...textProblems(point?.term, `${where} 第 ${index + 1} 条词`),
    ...textProblems(point?.note, `${where} 第 ${index + 1} 条解释`),
    ...endingProblems(point?.note, `${where} 第 ${index + 1} 条解释`),
  ])
}

/** 返回问题清单；空数组表示可以入库。 */
export function lectureProblems(day) {
  const problems = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day?.date || '')) problems.push('日期格式不对')
  if (!['B1', 'B2', 'C1'].includes(day?.level)) problems.push('难度须为 B1、B2 或 C1')
  if (!['DELF', 'DALF', 'TCF', 'TEF'].includes(day?.exam)) problems.push('考试名称不对')
  problems.push(...textProblems(day?.title, '标题'))
  if (typeof day?.title === 'string' && day.title.length > 160) problems.push('标题过长')
  const paragraphs = Array.isArray(day?.paragraphs) ? day.paragraphs : []
  if (!paragraphs.length) problems.push('正文为空')
  paragraphs.forEach((text, index) => problems.push(...textProblems(text, `正文第 ${index + 1} 段`)))
  const article = paragraphs.join(' ')

  const questions = Array.isArray(day?.questions) ? day.questions : []
  if (!questions.length) problems.push('没有题目')
  questions.forEach((question, index) => {
    const where = `第 ${index + 1} 题`
    problems.push(...textProblems(question?.stem, `${where}题干`))
    if (question?.note !== undefined) problems.push(...textProblems(question.note, `${where}题注`))
    const options = Array.isArray(question?.options) ? question.options : []
    const keys = options.map((option) => option?.key)
    for (const option of options) {
      problems.push(...textProblems(option?.key, `${where}选项键`), ...textProblems(option?.text, `${where}选项`))
      if (option?.key?.length > 8) problems.push(`${where}：选项键过长`)
    }
    if (new Set(keys).size !== keys.length) problems.push(`${where}：选项键重复`)
    if (keys.length < 2) problems.push(`${where}：选项不足`)
    if (!keys.includes(question?.answer)) problems.push(`${where}：答案不在选项里`)
    const evidence = Array.isArray(question?.evidence) ? question.evidence : []
    if (!evidence.length) problems.push(`${where}：没有引用原文`)
    evidence.forEach((quote) => {
      if (typeof quote !== 'string' || !quote.trim() || !paragraphs.some((p) => typeof p === 'string' && p.includes(quote))) problems.push(`${where}：引用的原文在文章里找不到`)
    })
  })

  problems.push(...textProblems(day?.titleNote?.zh, '标题翻译'))
  problems.push(...pointProblems(day?.titleNote?.points, '标题讲解'))
  const sentences = Array.isArray(day?.sentences) ? day.sentences : []
  if (!sentences.length) problems.push('没有逐句讲解')
  sentences.forEach((sentence, index) => {
    const where = `第 ${index + 1} 句`
    problems.push(...textProblems(sentence?.fr, `${where}原文`))
    problems.push(...textProblems(sentence?.zh, `${where}翻译`), ...endingProblems(sentence?.zh, `${where}翻译`))
    problems.push(...pointProblems(sentence?.points, where))
  })
  if (sentences.map((sentence) => sentence?.fr).join(' ') !== article) problems.push('逐句原文与正文不一致')
  problems.push(...pointProblems(day?.takeaways, '本篇要记'))
  return problems
}
