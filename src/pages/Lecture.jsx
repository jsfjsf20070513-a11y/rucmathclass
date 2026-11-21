import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import PageNav from '../components/PageNav'
import { archiveDate } from '../lib/archiveDate'
import { useArchiveScroll } from '../hooks/useArchiveScroll'
import { usePageFlip } from '../hooks/usePageFlip'
import { flipNavigation } from '../lib/flipNav'
import { useLectureLibrary } from '../hooks/useLectureLibrary'

// 每日阅读 Lecture：一天一页，左右翻换天，最新一天在最上面。
// 正面像一张试卷：文章 + 题目，选项可点；翻到背面是逐句讲解和题目讲解。
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'

// 法语标点前后的空格换成不换行空格，« 和 ? 不会单独落到行首或行尾。
const nb = (text) => text.replace(/« /g, '«\u00a0').replace(/ ([»?!:;])/g, '\u00a0$1')

function Recto({ day, chosen, onChoose, onTurn }) {
  return (
    <article className="lec-sheet" lang="fr">
      <h2 className="lec-title">{nb(day.title)}</h2>
      {day.paragraphs.map((text) => <p key={text} className="lec-p">{nb(text)}</p>)}
      <hr className="lec-rule" />
      <ol className="lec-questions">
        {day.questions.map((question, index) => (
          <li key={question.stem} className="lec-q">
            <p className="lec-stem">{`${index + 1}. ${nb(question.stem)}`}</p>
            <div className="lec-options" role="radiogroup" aria-label={`第 ${index + 1} 题`}>
              {question.options.map((option) => {
                const selected = chosen[index]?.key === option.key
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
                      <><span className="lec-key">{option.key}.</span><span>{nb(option.text)}</span></>
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
      <h2 className="lec-title" lang="fr">{nb(day.title)}</h2>
      <p className="lec-zh lec-title-zh">{day.titleNote.zh}</p>
      <Points items={day.titleNote.points} />
      <ol className="lec-sentences">
        {day.sentences.map((sentence, index) => (
          <li key={sentence.fr} className="lec-sentence">
            <p className="lec-fr" lang="fr">{`${CIRCLED[index] || `${index + 1}.`} ${nb(sentence.fr)}`}</p>
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
            const mine = question.options.some((option) => option.key === chosen[index]?.key) ? chosen[index].key : undefined
            const right = mine === question.answer
            return (
              <li key={question.stem} className="lec-answer">
                <p className="lec-verdict">
                  <span className="lec-verdict-key" lang="fr">{`${index + 1}. ${question.answer}`}</span>
                  {mine ? <span className={`lec-mine${right ? ' is-right' : ''}`}>{right ? '✓' : `你选了 ${mine}`}</span> : null}
                </p>
                {question.evidence.map((quote) => (
                  <p key={quote} className="lec-quote" lang="fr">{nb(`« ${quote} »`)}</p>
                ))}
              </li>
            )
          })}
        </ol>
      </section>
    </article>
  )
}

function ReadingPaper({ day, chosen, onChoose }) {
  const [verso, setVerso] = useState(false)
  const [turning, setTurning] = useState(false)
  const paper = useRef(null)
  const turn = () => {
    if (turning) return
    setTurning(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    setVerso(!verso)
  }

  useLayoutEffect(() => {
    if (!turning) return
    let active = true
    const finish = () => { if (active) setTurning(false) }
    const motion = paper.current.getAnimations()[0]
    if (motion) motion.finished.then(finish, finish)
    else finish()
    return () => { active = false }
  }, [turning])

  // 翻动时保留正在读的一面及其滚动位置。另一面刚挂载，从顶部开始。
  return <div ref={paper} className={`lec-paper${turning ? ' is-turning' : ''}${verso ? '' : ' to-recto'}`} inert={turning ? '' : undefined}>
    {(!verso || turning) && <div className="lec-scroll" data-flip-scroll="">
      <Recto day={day} chosen={chosen} onChoose={onChoose} onTurn={turn} />
    </div>}
    {(verso || turning) && <div className="lec-scroll lec-paper-back" data-flip-scroll="">
      <Verso day={day} chosen={chosen} onTurn={turn} />
    </div>}
  </div>
}

// 档案：像书架一样按日期列出全部往期，最新在上。
function Archive({ days, onOpen, onPrefetch, onHome, scrollRef }) {
  // 空闲时先取最新三篇；手指按下时再取被点的那篇。
  useEffect(() => {
    if (!days?.length) return undefined
    const run = () => days.slice(-3).forEach((day) => onPrefetch(day.date))
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 2000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(run, 300)
    return () => window.clearTimeout(id)
  }, [days, onPrefetch])

  return (
    <main className="lec" data-page-ready={Boolean(days)}>
      <PageNav onBack={onHome} />
      <div className="lec-scroll" ref={scrollRef}>
        <ol className="lec-archive">
          {[...(days || [])].reverse().map((day) => (
            <li key={day.date}>
              <button type="button" className="lec-entry" onPointerDown={() => onPrefetch(day.date)} onClick={() => onOpen(day.date)}>
                <span className="lec-entry-date" lang="fr">{`${archiveDate(day.date)} · ${day.level}`}</span>
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
function Reader({ days, articles, date, failed, onRetry, answers, onChoose }) {
  const navigate = useNavigate()
  const location = useLocation()
  // 只在打开时定位；之后左右翻只改地址，不重建页面栈。
  const [initial] = useState(() => days.findIndex((day) => day.date === date))
  const [waitingFor, setWaitingFor] = useState(null)
  const article = articles[date]
  useEffect(() => {
    if (article) return
    const timer = window.setTimeout(() => setWaitingFor(date), 1500)
    return () => window.clearTimeout(timer)
  }, [date, article])
  const ready = Boolean(article || failed[date] || waitingFor === date)
  const sides = useMemo(() => days.map((_, index) => (index === 0 ? 'none' : 'right')), [days])
  // 阅读时只认横向手势和方向键换天，读到页底继续滚不翻页。
  const fromArchive = Boolean(location.state?.fromArchive)
  const changeDate = useCallback((index) => {
    const next = days[index]?.date
    if (next) navigate(`/lecture/${next}`, { replace: true, state: fromArchive ? { fromArchive } : null })
  }, [days, fromArchive, navigate])
  const { jumpTo, setPageEl } = usePageFlip({ count: days.length, sides, durationMs: 500, initialPage: initial, wheel: false, onPageChange: changeDate })

  // 浏览器前进、后退改了地址时，翻到对应那天。
  useEffect(() => {
    const target = days.findIndex((day) => day.date === date)
    if (target >= 0) jumpTo(target)
  }, [date, days, jumpTo])

  const onArchive = useCallback(() => {
    if (fromArchive) navigate(-1)
    else navigate('/lecture')
  }, [fromArchive, navigate])

  return (
    <main className="lec" data-page-ready={ready}>
      <PageNav label="Archives" onBack={onArchive} />
      <div className={`lec-stack${ready ? '' : ' is-waiting'}`} inert={ready ? undefined : ''}>
        {days.map((entry, index) => {
          const day = articles[entry.date]
          const chosen = answers[entry.date] || {}
          return (
            <section
              key={entry.date}
              ref={setPageEl(index)}
              className="lec-page"
              style={{ zIndex: 10 + index, transform: index <= initial ? 'none' : 'translateX(105%) rotate(2.2deg)' }}
              aria-label={entry.title}
            >
              {day ? <ReadingPaper day={day} chosen={chosen} onChoose={(i, key) => onChoose(day.date, i, key)} /> :
                entry.date === date && ready && <div className="lec-load" role="status">
                  {failed[date] ? <button type="button" className="text-action" onClick={onRetry}>重试</button>
                    : <span lang="fr">Chargement…</span>}
                </div>}
            </section>
          )
        })}
      </div>
    </main>
  )
}

export default function Lecture({ account }) {
  const navigate = useNavigate()
  const { date } = useParams()
  const archiveScroll = useArchiveScroll()
  const { days, articles, failed, prefetch, retry } = useLectureLibrary(date)
  const availableDate = days?.some((day) => day.date === date) ? date : null
  const answers = useSyncExternalStore(account.subscribe, account.getSnapshot)
  useEffect(() => {
    account.view(availableDate)
    return () => { account.view(null) }
  }, [account, availableDate])

  const goHome = useCallback(() => {
    flipNavigation.mark('/lecture', '/')
    navigate('/')
  }, [navigate])

  if (!date || !days) {
    return <Archive days={days} scrollRef={archiveScroll} onHome={goHome} onPrefetch={prefetch} onOpen={(day) => {
      navigate(`/lecture/${day}`, { state: { fromArchive: true } })
    }} />
  }
  if (!availableDate) return <Navigate to="/lecture" replace />
  return <Reader days={days} articles={articles} date={date} failed={failed} onRetry={retry} answers={answers} onChoose={account.choose} />
}
