import { describe, expect, it } from 'vitest'
import { lectureProblems } from './lectureContent'
import { lectureSamples } from '../data/lectureSamples'

describe('lectureProblems', () => {
  it('现有样稿全部通过', () => {
    for (const day of lectureSamples) expect(lectureProblems(day), day.date).toEqual([])
  })

  it('拦下 Markdown、表情、套话和黑话', () => {
    const day = structuredClone(lectureSamples[0])
    day.sentences[0].points[0].note = '**离开**。'
    day.sentences[1].points[0].note = '从那时起一直如此 😊'
    day.sentences[2].points[0].note = '仅供参考。'
    day.sentences[3].points[0].note = '这是赘词。'
    expect(lectureProblems(day)).toEqual([
      '第 1 句 第 1 条解释：含 Markdown 符号',
      '第 2 句 第 1 条解释：含表情符号',
      '第 3 句 第 1 条解释：含「仅供参考」',
      '第 4 句 第 1 条解释：含「赘词」',
    ])
  })

  it('答案必须在选项里，引用必须出自原文', () => {
    const day = structuredClone(lectureSamples[0])
    day.questions[0].answer = 'Z'
    day.questions[1].evidence = ['un texte inventé']
    expect(lectureProblems(day)).toEqual([
      '第 1 题：答案不在选项里',
      '第 2 题：引用的原文在文章里找不到',
    ])
  })
})
