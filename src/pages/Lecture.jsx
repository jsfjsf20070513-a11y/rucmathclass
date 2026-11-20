import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import PageNav from '../components/PageNav'
import { usePageFlip } from '../hooks/usePageFlip'
import { markFlipNav, wasFlipNav } from '../lib/flipNav'
import { lectureSamples } from '../data/lectureSamples'

// 每日阅读 Lecture：一天一页，左右翻换天，最新一天在最上面。
// 正面像一张试卷：文章 + 题目，选项可点；翻到背面是逐句讲解和题目讲解。
// 现阶段数据来自样稿，选过的答案只存在本机；接入 Worker 后改为按账号保存。

const ANSWERS_KEY = 'mcw_lecture_answers_v1'
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

// 本机记录可能被别的版本或手工改坏：只留「日期 → 题号 → 选项键」这种形状。
function readAnswers() {
  let saved
  try { saved = JSON.parse(window.localStorage.getItem(ANSWERS_KEY) || '{}') } catch { return {} }
  if (!isRecord(saved)) return {}
  const clean = {}
  for (const [date, picks] of Object.entries(saved)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isRecord(picks)) continue
    const kept = Object.entries(picks).filter(([index, key]) => /^\d+$/.test(index) && typeof key === 'string' && key.length <= 8)
    if (kept.length) clean[date] = Object.fromEntries(kept)
  }
  return clean
}

// 每次只写这一题：先读最新记录再合并，另一个标签页刚选的答案不会被覆盖。
function saveAnswer(date, index, key) {
  const saved = readAnswers()
  saved[date] = { ...saved[date], [index]: key }
  try { window.localStorage.setItem(ANSWERS_KEY, JSON.stringify(saved)) } catch { /* 存不下时只影响本机记录 */ }
  return saved
}

function Recto({ day, chosen, onChoose, onTurn }) {
  return (
    <article className="lec-sheet" lang="fr">
      <h2 className="lec-title">{day.title}</h2>
      {day.paragraphs.map((text) => <p key={text} className="lec-p">{text}</p>)}
      <hr className="lec-rule" />
      <ol className="lec-questions">
        {day.questions.map((question, index) => (
          <li key={question.stem} className="lec-q">
            <p className="lec-stem">{`${index + 1}. ${question.stem}`}</p>
            <div className="lec-options" role="radiogroup" aria-label={`第 ${index + 1} 题`}>
              {question.options.map((option) => {
                const selected = chosen[index] === option.key
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`lec-option${selected ? ' is-chosen' : ''}`}
                    onClick={() => onChoose(index, option.key)}
                  >
                    {option.key === option.text ? option.text : (
                      <><span className="lec-key">{option.key}.</span><span>{option.text}</span></>
                    )}
                  </button>
                )
              })}
            </div>
            {question.note ? <p className="lec-note">{question.note}</p> : null}
          </li>
        ))}
      </ol>
      <div className="lec-turn">
        <button type="button" className="lec-link" onClick={onTurn}>Verso&nbsp;&nbsp;→</button>
      </div>
    </article>
  )
}

// 讲解正文里夹的法语用西文字体衬出，不加粗、不斜体。
const FRENCH_RUN = /([A-Za-zÀ-ÿŒœ][A-Za-zÀ-ÿŒœ’'\-.…]*(?:[ ,]+[A-Za-zÀ-ÿŒœ][A-Za-zÀ-ÿŒœ’'\-.…]*)*)/
function Mixed({ text }) {
  return text.split(FRENCH_RUN).map((part, index) => (
    index % 2 ? <span key={index} className="lec-latin" lang="fr">{part}</span> : part
  ))
}

// 一条讲一件事：加粗的法语词或结构，冒号，中文解释。考点前加酒红星号。
function Points({ items }) {
  if (!items.length) return null
  return (
    <ul className="lec-points">
      {items.map((item) => (
        <li key={item.term}>
          {item.star ? <span className="lec-star" aria-label="常考">★{'\uFE0E'}</span> : null}
          <b className="lec-term"><Mixed text={item.term} /></b>
          {'：'}
          <Mixed text={item.note} />
        </li>
      ))}
    </ul>
  )
}

function Verso({ day, chosen, onTurn }) {
  return (
    <article className="lec-sheet lec-verso">
      <div className="lec-verso-top">
        <button type="button" className="lec-link" lang="fr" onClick={onTurn}>←&nbsp;&nbsp;Recto</button>
      </div>
      <h2 className="lec-title" lang="fr">{day.title}</h2>
      <p className="lec-zh lec-title-zh">{day.titleNote.zh}</p>
      <Points items={day.titleNote.points} />
      <ol className="lec-sentences">
        {day.sentences.map((sentence, index) => (
          <li key={sentence.fr} className="lec-sentence">
            <p className="lec-fr" lang="fr">{`${CIRCLED[index] || `${index + 1}.`} ${sentence.fr}`}</p>
            <p className="lec-zh">{sentence.zh}</p>
            <Points items={sentence.points} />
          </li>
        ))}
      </ol>
      <section className="lec-block">
        <h3 className="lec-sec">本篇要记</h3>
        <Points items={day.takeaways} />
      </section>
      <section className="lec-block">
        <h3 className="lec-sec">题目</h3>
        <ol className="lec-answers">
          {day.questions.map((question, index) => {
            const mine = question.options.some((option) => option.key === chosen[index]) ? chosen[index] : undefined
            const right = mine === question.answer
            return (
              <li key={question.stem} className="lec-answer">
                <p className="lec-verdict">
                  <span className="lec-verdict-key" lang="fr">{`${index + 1}. ${question.answer}`}</span>
                  {mine ? <span className={`lec-mine${right ? ' is-right' : ''}`}>{right ? '✓' : `你选了 ${mine}`}</span> : null}
                </p>
                {question.evidence.map((quote) => (
                  <p key={quote} className="lec-quote" lang="fr">{`« ${quote} »`}</p>
                ))}
              </li>
            )
          })}
        </ol>
      </section>
    </article>
  )
}

const FR_DATE = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const frDate = (iso) => FR_DATE.format(new Date(`${iso}T00:00:00Z`))

// 档案：像书架一样按日期列出全部往期，最新在上。
function Archive({ days, onOpen, onHome, arrive }) {
  return (
    <main className={`lec${arrive ? ' page-arrive' : ''}`}>
      <PageNav title="" onBack={onHome} />
      <div className="lec-scroll">
        <ol className="lec-archive">
          {[...days].reverse().map((day) => (
            <li key={day.date}>
              <button type="button" className="lec-entry" onClick={() => onOpen(day.date)}>
                <span className="lec-entry-date" lang="fr">{`${frDate(day.date)} · ${day.level}`}</span>
                <span className="lec-entry-title" lang="fr">{day.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </main>
  )
}

// 阅读：一天一页，左右翻到相邻的日子，地址随当前这一天更新。
function Reader({ days, date, answers, onChoose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [turned, setTurned] = useState({})
  const scrollers = useRef({})
  // 只在打开时定位；之后左右翻只改地址，不重建页面栈。
  const [initial] = useState(() => days.findIndex((day) => day.date === date))
  const sides = useMemo(() => days.map((_, index) => (index === 0 ? 'none' : 'right')), [days])
  // 阅读时只认横向手势和方向键换天，读到页底继续滚不翻页。
  const { page, goTo, setPageEl } = usePageFlip({ count: days.length, sides, durationMs: 500, initialPage: initial, wheel: false })

  // 翻到哪天，地址就换成哪天（替换当前记录，后退仍回到档案）。
  const fromArchive = Boolean(location.state?.fromArchive)
  useEffect(() => {
    const current = days[page]?.date
    if (current) navigate(`/lecture/${current}`, { replace: true, state: fromArchive ? { fromArchive } : null })
  }, [page, days, navigate, fromArchive])

  // 浏览器前进、后退改了地址时，翻到对应那天。
  useEffect(() => {
    const target = days.findIndex((day) => day.date === date)
    if (target >= 0) goTo(target)
  }, [date, days, goTo])

  const onArchive = useCallback(() => {
    if (fromArchive) navigate(-1)
    else navigate('/lecture')
  }, [fromArchive, navigate])

  const turn = useCallback((date) => {
    setTurned((current) => ({ ...current, [date]: !current[date] }))
    scrollers.current[date]?.scrollTo({ top: 0 })
  }, [])

  return (
    <main className="lec">
      <nav className="page-nav" aria-label="页内导航">
        <button type="button" className="page-nav-back" lang="fr" onClick={onArchive}>Archives</button>
      </nav>
      <div className="lec-stack">
        {days.map((day, index) => {
          const chosen = answers[day.date] || {}
          return (
            <section
              key={day.date}
              ref={setPageEl(index)}
              className="lec-page"
              style={{ zIndex: 10 + index, transform: index <= initial ? 'none' : 'translateX(105%) rotate(2.2deg)' }}
              aria-label={day.title}
            >
              <div className="lec-scroll" data-flip-scroll="" ref={(el) => { scrollers.current[day.date] = el }}>
                {turned[day.date]
                  ? <Verso day={day} chosen={chosen} onTurn={() => turn(day.date)} />
                  : <Recto day={day} chosen={chosen} onChoose={(i, key) => onChoose(day.date, i, key)} onTurn={() => turn(day.date)} />}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}

export default function Lecture() {
  const navigate = useNavigate()
  const { date } = useParams()
  const [arrive] = useState(() => wasFlipNav())
  const days = lectureSamples
  const [answers, setAnswers] = useState(readAnswers)

  // 另一个标签页答了题，这里同步显示。
  useEffect(() => {
    const onStorage = (event) => { if (event.key === ANSWERS_KEY) setAnswers(readAnswers()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const choose = useCallback((day, index, key) => setAnswers(saveAnswer(day, index, key)), [])

  const goHome = useCallback(() => {
    markFlipNav('/lecture')
    navigate('/')
  }, [navigate])

  if (!date) {
    return <Archive days={days} arrive={arrive} onHome={goHome} onOpen={(day) => navigate(`/lecture/${day}`, { state: { fromArchive: true } })} />
  }
  if (!days.some((day) => day.date === date)) return <Navigate to="/lecture" replace />
  return <Reader days={days} date={date} answers={answers} onChoose={choose} />
}
