import { frenchVocabulary } from '../data/frenchVocabulary'
import { cleanFrenchDeck } from './srsScheduler'
import { EXERCISE_TYPES, buildExercise, buildMatchExercise, findAmbiguousSpellingPrompts } from './exerciseGenerator'

export const MAX_NEW = 8
export const MAX_REVIEW = 40
// Rotate exercise formats across the session so a word is met different ways.
const TYPE_ROTATION = [
  EXERCISE_TYPES.recognition,
  EXERCISE_TYPES.build,
  EXERCISE_TYPES.cloze,
  EXERCISE_TYPES.listen,
  EXERCISE_TYPES.spelling,
]
export const VALID_DECK = cleanFrenchDeck(frenchVocabulary).valid
export const DECK_BY_ID = new Map(VALID_DECK.map((w) => [w.id, w]))
const AMBIGUOUS_SPELLING_PROMPTS = findAmbiguousSpellingPrompts(VALID_DECK)
// 会话快照:手机切屏/刷新会清掉 React 状态,SRS 评分虽已逐题入云,
// 但"这一轮做到第几题"会丢——存 localStorage,当日同账号自动原地续。
const sessionKey = (userId) => `mcw_vocab_session_v2:${userId}`

function shanghaiDayStamp() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export function readSessionSnapshot(userId) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(sessionKey(userId)) || 'null')
    if (!saved || saved.v !== 2 || saved.userId !== userId) return null
    // An unconfirmed write must survive midnight until it is reconciled.
    if (saved.day !== shanghaiDayStamp() && !saved.pending) return null
    if (saved.status !== 'study' && saved.status !== 'ready') return null
    if (!Array.isArray(saved.queue) || !saved.queue.length) return null
    if (!saved.queue.every((q) => q && DECK_BY_ID.has(q.id))) return null
    if (saved.pending && (saved.pending.state?.user_id !== userId || !saved.queue.some((q) => q.id === saved.pending.state?.word_id))) return null
    return saved
  } catch {
    return null
  }
}

export function clearSessionSnapshot(userId) {
  try { window.localStorage.removeItem(sessionKey(userId)) } catch { /* ignore */ }
}

export function writeSessionSnapshot(snapshot) {
  window.localStorage.setItem(sessionKey(snapshot.userId), JSON.stringify({ ...snapshot, v: 2, day: shanghaiDayStamp() }))
}

// Turn the SRS study queue into a list of exercise steps. A match warm-up leads
// when there are ≥4 cards; the rest rotate through the formats. Non-match steps
// carry the word + SRS state so grading can persist.
export function buildSession(queue, deck) {
  const steps = []
  if (queue.length >= 4) {
    // 只减少热身里的重复标签，不删热身步骤，以免旧练习记录的题号错位。
    steps.push({ kind: 'match', exercise: buildMatchExercise(queue.map((q) => q.word)) })
  }
  queue.forEach((item, idx) => {
    let type = TYPE_ROTATION[idx % TYPE_ROTATION.length]
    // 「词块拼句」要求把例句译成法语,必须有例句中文(exampleZh)做题干;没有就
    // 换成拼写题,绝不出"考拼句却不给中文"的残题。
    if (type === EXERCISE_TYPES.build && !item.word.exampleZh) {
      type = EXERCISE_TYPES.spelling
    }
    steps.push({ kind: 'card', word: item.word, state: item.state, exercise: buildExercise(item.word, deck, { type, ambiguousSpellingPrompts: AMBIGUOUS_SPELLING_PROMPTS }) })
  })
  return steps
}
