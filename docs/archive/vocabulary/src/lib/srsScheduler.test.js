import { describe, it, expect } from 'vitest'
import {
  CURVE_DAYS,
  MAX_STAGE,
  REVIEW_RESULT,
  clampStage,
  computeNextReviewAt,
  gradeReviewState,
  createInitialState,
  isDue,
  interleaveStates,
  cleanFrenchWord,
  cleanFrenchDeck,
  buildStudyQueue,
  computeDeckStats,
  MASTERED_STAGE,
  FRENCH_GENDERS,
} from './srsScheduler'

const NOW = '2026-06-17T09:30:00.000Z' // mid-day; anchoring should drop the time

describe('clampStage', () => {
  it('keeps stages within [0, MAX_STAGE]', () => {
    expect(clampStage(-3)).toBe(0)
    expect(clampStage(0)).toBe(0)
    expect(clampStage(MAX_STAGE)).toBe(MAX_STAGE)
    expect(clampStage(MAX_STAGE + 5)).toBe(MAX_STAGE)
    expect(clampStage(2.9)).toBe(2)
    expect(clampStage(NaN)).toBe(0)
  })
})

describe('computeNextReviewAt — Ebbinghaus ladder, day-anchored', () => {
  it('lands CURVE_DAYS[stage] days after the completion DATE (time dropped)', () => {
    // stage 0 → +1 day from 2026-06-17 → 2026-06-18T00:00:00Z
    expect(computeNextReviewAt(NOW, 0)).toBe('2026-06-18T00:00:00.000Z')
    expect(computeNextReviewAt(NOW, 1)).toBe('2026-06-19T00:00:00.000Z') // +2
    expect(computeNextReviewAt(NOW, 2)).toBe('2026-06-21T00:00:00.000Z') // +4
    expect(computeNextReviewAt(NOW, 3)).toBe('2026-06-24T00:00:00.000Z') // +7
  })

  it('anchors so two same-day completions resurface on the same date', () => {
    const a = computeNextReviewAt('2026-06-17T01:00:00Z', 2)
    const b = computeNextReviewAt('2026-06-17T23:00:00Z', 2)
    expect(a).toBe(b)
  })

  it('clamps out-of-range stages to the ladder', () => {
    expect(computeNextReviewAt(NOW, 999)).toBe(computeNextReviewAt(NOW, MAX_STAGE))
  })
})

describe('gradeReviewState', () => {
  it('advances one stage and grows the streak on a correct answer', () => {
    const prev = { proficiency_level: 1, streak_count: 3 }
    const next = gradeReviewState(prev, REVIEW_RESULT.correct, NOW)
    expect(next.proficiency_level).toBe(2)
    expect(next.streak_count).toBe(4)
    expect(next.last_result).toBe('correct')
    expect(next.next_review_at).toBe(computeNextReviewAt(NOW, 2))
  })

  it('caps advancement at MAX_STAGE', () => {
    const prev = { proficiency_level: MAX_STAGE, streak_count: 9 }
    const next = gradeReviewState(prev, REVIEW_RESULT.correct, NOW)
    expect(next.proficiency_level).toBe(MAX_STAGE)
  })

  it('resets to stage 0 and zeroes the streak on a wrong answer', () => {
    const prev = { proficiency_level: 4, streak_count: 6 }
    const next = gradeReviewState(prev, REVIEW_RESULT.wrong, NOW)
    expect(next.proficiency_level).toBe(0)
    expect(next.streak_count).toBe(0)
    expect(next.last_result).toBe('wrong')
    expect(next.next_review_at).toBe(computeNextReviewAt(NOW, 0))
  })

  it('treats a missing prior state as stage 0', () => {
    const next = gradeReviewState(undefined, REVIEW_RESULT.correct, NOW)
    expect(next.proficiency_level).toBe(1)
    expect(next.streak_count).toBe(1)
  })

  it('preserves identity fields (user_id, word_id)', () => {
    const prev = { user_id: 'u', word_id: 'w', proficiency_level: 0, streak_count: 0 }
    const next = gradeReviewState(prev, REVIEW_RESULT.correct, NOW)
    expect(next.user_id).toBe('u')
    expect(next.word_id).toBe('w')
  })
})

describe('createInitialState / isDue', () => {
  it('creates a brand-new card that is immediately due', () => {
    const state = createInitialState('u1', 'w1', NOW)
    expect(state).toMatchObject({ user_id: 'u1', word_id: 'w1', proficiency_level: 0, streak_count: 0, last_result: null })
    expect(isDue(state, NOW)).toBe(true)
  })

  it('isDue is true at/before next_review_at, false after', () => {
    const state = { next_review_at: '2026-06-20T00:00:00Z' }
    expect(isDue(state, '2026-06-19T12:00:00Z')).toBe(false)
    expect(isDue(state, '2026-06-20T00:00:00Z')).toBe(true)
    expect(isDue(state, '2026-06-21T00:00:00Z')).toBe(true)
  })

  it('treats a stateless / missing next_review_at as due', () => {
    expect(isDue({}, NOW)).toBe(true)
    expect(isDue(null, NOW)).toBe(true)
  })
})

describe('interleaveStates — new, review, new, review …', () => {
  it('alternates new and review cards', () => {
    expect(interleaveStates(['n1', 'n2', 'n3'], ['r1', 'r2', 'r3']))
      .toEqual(['n1', 'r1', 'n2', 'r2', 'n3', 'r3'])
  })

  it('appends the tail of the longer list', () => {
    expect(interleaveStates(['n1', 'n2', 'n3'], ['r1'])).toEqual(['n1', 'r1', 'n2', 'n3'])
    expect(interleaveStates(['n1'], ['r1', 'r2', 'r3'])).toEqual(['n1', 'r1', 'r2', 'r3'])
  })

  it('handles empty inputs and does not mutate them', () => {
    const news = ['n1']
    const reviews = []
    expect(interleaveStates(news, reviews)).toEqual(['n1'])
    expect(interleaveStates([], [])).toEqual([])
    expect(news).toEqual(['n1'])
  })
})

describe('cleanFrenchWord — domain validation', () => {
  it('accepts a noun with a gender and normalizes it', () => {
    const { ok, word } = cleanFrenchWord({ french: 'chat', chinese: '猫', pos: 'Noun', gender: 'M' })
    expect(ok).toBe(true)
    expect(word.gender).toBe('m')
    expect(word.pos).toBe('noun')
  })

  it('rejects a noun without a valid gender', () => {
    expect(cleanFrenchWord({ french: 'chat', chinese: '猫', pos: 'noun' }).ok).toBe(false)
    expect(cleanFrenchWord({ french: 'chat', chinese: '猫', pos: 'noun', gender: 'x' }).errors)
      .toContain('名词必须标注阴阳性 gender ∈ {m, f}')
  })

  it('accepts a verb with a string or object conjugation', () => {
    expect(cleanFrenchWord({ french: 'parler', chinese: '说', pos: 'verb', conjugation: 'je parle' }).ok).toBe(true)
    expect(cleanFrenchWord({ french: 'parler', chinese: '说', pos: 'v', conjugation: { je: 'parle' } }).ok).toBe(true)
  })

  it('rejects a verb without a conjugation', () => {
    const { ok, errors } = cleanFrenchWord({ french: 'parler', chinese: '说', pos: 'verb' })
    expect(ok).toBe(false)
    expect(errors).toContain('动词必须提供变位 conjugation')
  })

  it('rejects missing french / chinese / pos', () => {
    expect(cleanFrenchWord({ chinese: '猫', pos: 'noun', gender: 'm' }).errors).toContain('缺少法语词条 (french)')
    expect(cleanFrenchWord({ french: 'chat', pos: 'noun', gender: 'm' }).errors).toContain('缺少中文释义 (chinese)')
    expect(cleanFrenchWord({ french: 'chat', chinese: '猫' }).errors).toContain('缺少词性 (pos)')
  })

  it('exposes the gender whitelist', () => {
    expect([...FRENCH_GENDERS].sort()).toEqual(['f', 'm'])
  })
})

describe('cleanFrenchDeck', () => {
  it('splits a raw list into valid and rejected with reasons', () => {
    const { valid, rejected } = cleanFrenchDeck([
      { french: 'chat', chinese: '猫', pos: 'noun', gender: 'm' },
      { french: 'livre', chinese: '书', pos: 'noun' }, // missing gender
      { french: 'parler', chinese: '说', pos: 'verb', conjugation: 'je parle' },
    ])
    expect(valid).toHaveLength(2)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].errors.length).toBeGreaterThan(0)
  })
})

describe('buildStudyQueue', () => {
  const deck = [
    { id: 'w1', french: 'a' },
    { id: 'w2', french: 'b' },
    { id: 'w3', french: 'c' },
    { id: 'w4', french: 'd' },
  ]

  it('treats unseen words as new and due-states as review, then interleaves', () => {
    const stateMap = {
      w2: { word_id: 'w2', next_review_at: '2026-06-10T00:00:00Z' }, // due
      w4: { word_id: 'w4', next_review_at: '2026-06-30T00:00:00Z' }, // not due yet
    }
    const queue = buildStudyQueue({ deck, stateMap, now: NOW })
    const ids = queue.map((item) => item.word.id)
    // new = w1, w3 ; review (due) = w2 ; w4 excluded (future)
    expect(ids).toEqual(['w1', 'w2', 'w3'])
    expect(queue[0].isNew).toBe(true)
    expect(queue[1].isNew).toBe(false)
  })

  it('orders review cards most-overdue first', () => {
    const stateMap = {
      w1: { next_review_at: '2026-06-16T00:00:00Z' },
      w2: { next_review_at: '2026-06-01T00:00:00Z' },
      w3: { next_review_at: '2026-06-10T00:00:00Z' },
    }
    const queue = buildStudyQueue({ deck: deck.slice(0, 3), stateMap, now: NOW, maxNew: 0 })
    expect(queue.map((i) => i.word.id)).toEqual(['w2', 'w3', 'w1'])
  })

  it('respects maxNew / maxReview caps', () => {
    const queue = buildStudyQueue({ deck, stateMap: {}, now: NOW, maxNew: 2 })
    expect(queue).toHaveLength(2)
    expect(queue.every((i) => i.isNew)).toBe(true)
  })

  it('seeds new cards with a usable initial state', () => {
    const [first] = buildStudyQueue({ deck: [{ id: 'w1' }], stateMap: {}, now: NOW })
    expect(first.state).toMatchObject({ word_id: 'w1', proficiency_level: 0 })
  })
})

describe('computeDeckStats', () => {
  const deck = [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }, { id: 'w4' }]

  it('classifies new / learning / mastered and counts due', () => {
    const stateMap = {
      w2: { proficiency_level: 2, next_review_at: '2026-06-10T00:00:00Z' }, // learning, due
      w3: { proficiency_level: MASTERED_STAGE, next_review_at: '2026-06-30T00:00:00Z' }, // mastered, not due
      w4: { proficiency_level: MASTERED_STAGE + 1, next_review_at: '2026-06-01T00:00:00Z' }, // mastered, due
    }
    const stats = computeDeckStats({ deck, stateMap, now: NOW })
    expect(stats).toEqual({ total: 4, newCount: 1, learning: 1, mastered: 2, due: 3 })
    // due = w1(new) + w2(due) + w4(due) = 3
  })

  it('counts an all-new deck as all due', () => {
    expect(computeDeckStats({ deck, stateMap: {}, now: NOW }))
      .toEqual({ total: 4, newCount: 4, learning: 0, mastered: 0, due: 4 })
  })
})

describe('CURVE_DAYS sanity', () => {
  it('is a strictly increasing ladder', () => {
    for (let i = 1; i < CURVE_DAYS.length; i += 1) {
      expect(CURVE_DAYS[i]).toBeGreaterThan(CURVE_DAYS[i - 1])
    }
  })
})
