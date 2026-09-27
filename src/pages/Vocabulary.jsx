import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import AuthStatus from '../components/AuthStatus'
import PageNav from '../components/PageNav'
import { EXERCISE_TYPES } from '../lib/exerciseGenerator'
import { VALID_DECK } from '../lib/vocabularySession'
import { useVocabularyTrainer } from '../hooks/useVocabularyTrainer'
import { markFlipNav, wasFlipNav } from '../lib/flipNav'

// 卡片与排版留在页面；题目构建、快照、评分和条件写入各有独立模块。

// CEFR ladder A1→C2; only the levels actually present in the deck are offered.
const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const DECK_LEVELS = ['all', ...LEVEL_ORDER.filter((l) => VALID_DECK.some((w) => w.level === l))]

const ROMAN_OPT = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ']

// 题型眉头(法语刊名 + 中文小注)。
const TYPE_KICKER = {
  [EXERCISE_TYPES.match]: ['Association', '配对'],
  [EXERCISE_TYPES.recognition]: ['Reconnaissance', '选择词义'],
  [EXERCISE_TYPES.cloze]: ['Complétez', '例句填空'],
  [EXERCISE_TYPES.listen]: ['Dictée', '听写'],
  [EXERCISE_TYPES.spelling]: ['Orthographe', '拼写'],
  [EXERCISE_TYPES.build]: ['Traduction', '拼句'],
}

// Short grammatical label for the prompt line, e.g. « n.f. » / « v. » / « adj. ».
function posLabel(word) {
  if (!word) return ''
  if (word.pos === 'verb') return 'v.'
  if (word.pos === 'adjective') return 'adj.'
  if (word.pos === 'noun') return word.gender === 'm' ? 'n.m.' : word.gender === 'f' ? 'n.f.' : 'n.'
  return ''
}

// Long italic part-of-speech for the study card, in French.
function posLong(word) {
  if (!word) return ''
  if (word.pos === 'verb') return 'verbe'
  if (word.pos === 'adjective') return 'adjectif'
  if (word.pos === 'adverb') return 'adverbe'
  if (word.pos === 'noun') return word.gender === 'm' ? 'nom masc.' : word.gender === 'f' ? 'nom fém.' : 'nom'
  return ''
}

export default function Vocabulary() {
  const { user, loading: authLoading, error: authError } = useAuth()
  const userId = user?.id
  const navigate = useNavigate()
  const [arrive] = useState(() => wasFlipNav())
  const {
    status,
    studyList,
    studyIdx,
    steps,
    i,
    phase,
    lastCorrect,
    picked,
    input,
    setInput,
    chosen,
    match,
    stats,
    wrong,
    deckStats,
    errorMessage,
    saveStatus,
    sessionOwnerId,
    level,
    inputRef,
    current,
    speak,
    load,
    commencer,
    persistAnswer,
    choose,
    submitSpelling,
    submitBuild,
    tapTile,
    tapMatch,
    next,
    retryWrong,
    studyNext,
    skipStudy,
    changeLevel
  } = useVocabularyTrainer(userId)

  const goHome = useCallback(() => {
    markFlipNav('/vocabulary')
    navigate('/')
  }, [navigate])

  // ── render helpers ──
  const ex = current?.exercise
  const fb = phase === 'feedback'
  const acc = stats.attempts ? `${Math.round((stats.correct / stats.attempts) * 100)}%` : '—'
  const newInQueue = studyList.filter((x) => x.isNew).length
  const revInQueue = studyList.length - newInQueue

  // 底部常驻进度线(全场唯一计数)。
  const progress = status === 'ready' && steps.length
    ? { fill: (i + 1) / steps.length, label: `${i + 1} / ${steps.length}` }
    : status === 'study' && studyList.length
      ? { fill: (studyIdx + 1) / studyList.length, label: `Aperçu ${studyIdx + 1} / ${studyList.length}` }
      : null

  // 筛选:只剩 CEFR 级别一行,只住扉页/空/结算屏(禁令 #3)。
  function renderFilters() {
    return (
      <div className="vpl-filters">
        <div className="vpl-filter-row">
          <span className="vpl-filter-key" lang="fr">Niveau</span>
          <span className="vpl-filter-val">
            {DECK_LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => changeLevel(l)}
                aria-pressed={level === l}
                className={`vpl-chip${level === l ? ' is-on' : ''}`}
              >
                {l === 'all' ? 'Tous' : l}
              </button>
            ))}
          </span>
        </div>
      </div>
    )
  }

  function renderOptions() {
    return (
      <div className="vpl-options" role="listbox" aria-label="选项">
        {ex.options.map((opt, k) => {
          let cls = 'vpl-option'
          if (fb) {
            if (opt === ex.answer) cls += ' is-answer'
            else if (opt === picked) cls += ' is-picked-wrong'
            else cls += ' is-dim'
          }
          return (
            <button
              key={opt}
              type="button"
              className={cls}
              onClick={() => choose(opt)}
              disabled={fb}
              lang={ex.type === EXERCISE_TYPES.recognition ? undefined : 'fr'}
            >
              <span className="vpl-option-roman" aria-hidden="true">{ROMAN_OPT[k] || k + 1}</span>
              <span className="vpl-option-text">{opt}</span>
            </button>
          )
        })}
      </div>
    )
  }

  function renderFeedback() {
    if (!fb || !ex) return null
    const isMatch = ex.type === EXERCISE_TYPES.match
    const ok = isMatch || lastCorrect
    // recognition + build resolve to the exercise answer; the rest reveal the French headword.
    const correct = (ex.type === EXERCISE_TYPES.recognition || ex.type === EXERCISE_TYPES.build)
      ? ex.answer
      : (current.word?.french || ex.answer)
    const glossRaw = ex.type === EXERCISE_TYPES.build ? current.word?.exampleZh : current.word?.chinese
    const gloss = glossRaw === correct ? '' : glossRaw // 识别题答案本身就是中文,别重复一遍
    return (
      <div className={`vpl-fb ${ok ? 'is-ok' : 'is-no'}`}>
        <p className="vpl-fb-verdict">{isMatch ? 'Complet ✓ 配对完成' : ok ? 'Juste ✓ 答对' : 'Faux ✗ 答错'}</p>
        {!ok ? (
          <p className="vpl-fb-answer"><span lang="fr">{correct}</span>{gloss ? <span className="vpl-fb-gloss"> · {gloss}</span> : null}</p>
        ) : null}
        {!isMatch && current.word?.note ? <p className="vpl-fb-note">N.B. {current.word.note}</p> : null}
        {saveStatus === 'saving' ? <p className="vpl-fb-note" role="status">正在保存本题进度…</p> : null}
        {errorMessage ? <p className="vpl-fb-note" role="alert">{errorMessage}</p> : null}
        <div className="vpl-fb-actions">
          {saveStatus === 'error' ? <button type="button" className="text-action" onClick={() => persistAnswer(current)}>重试保存 →</button> : null}
          {saveStatus === 'conflict' ? <button type="button" className="text-action" onClick={() => load()}>重新加载进度 →</button> : null}
          <button type="button" className="text-action" onClick={next} disabled={saveStatus !== 'saved'}>
            {i + 1 >= steps.length ? 'Terminer  →' : 'Continuer  →'}
          </button>
          {/* AI 退到具体对象之后:只在答错的这一刻,给一个带上下文的解释入口。 */}
          {!ok && current.word ? (
            <Link
              className="vpl-explain"
              to={`/assistant?term=${encodeURIComponent(current.word.french)}&answer=${encodeURIComponent(picked || input || '')}`}
            >
              Expliquer · 请助手解释
            </Link>
          ) : null}
        </div>
      </div>
    )
  }

  // 题版卡:左幅题干(眉头 + 大字),右幅交互(选项/输入/词块/配对)。
  function renderExercise() {
    const [kfr, kzh] = TYPE_KICKER[ex.type] || ['', '']
    const isChoice = ex.type === EXERCISE_TYPES.recognition || ex.type === EXERCISE_TYPES.cloze || ex.type === EXERCISE_TYPES.listen

    let stage = null
    let interaction = null

    if (ex.type === EXERCISE_TYPES.match) {
      stage = <p className="vpl-cue">点法语,再点对应的中文。</p>
      const flash = (side, id) => match.wrong.includes(`${side}${id}`)
      const tileClass = (side, c) => `vpl-tile${match.done.includes(c.id) ? ' is-done' : ''}${match.sel?.side === side && match.sel?.id === c.id ? ' is-sel' : ''}${flash(side, c.id) ? ' is-wrong' : ''}`
      interaction = (
        <div className="vpl-match">
          <div className="vpl-match-col">
            {ex.left.map((c) => (
              <button key={c.id} type="button" lang="fr" className={tileClass('L', c)} onClick={() => tapMatch('L', c.id)} disabled={match.done.includes(c.id)}>{c.text}</button>
            ))}
          </div>
          <div className="vpl-match-col">
            {ex.right.map((c) => (
              <button key={c.id} type="button" className={tileClass('R', c)} onClick={() => tapMatch('R', c.id)} disabled={match.done.includes(c.id)}>{c.text}</button>
            ))}
          </div>
        </div>
      )
    } else if (ex.type === EXERCISE_TYPES.recognition) {
      stage = (
        <>
          <p className="vpl-word" lang="fr">{ex.prompt}</p>
          <div className="vpl-word-meta">
            {posLong(current.word) ? <span lang="fr">{posLong(current.word)}</span> : null}
            <button type="button" className="vpl-listen" onClick={() => speak(current.word?.french)} lang="fr">Écouter ▷</button>
          </div>
        </>
      )
      interaction = renderOptions()
    } else if (ex.type === EXERCISE_TYPES.cloze) {
      stage = <p className="vpl-sentence" lang="fr">{ex.sentence}</p>
      interaction = renderOptions()
    } else if (ex.type === EXERCISE_TYPES.listen) {
      stage = (
        <button type="button" className="vpl-listen vpl-listen-lg" onClick={() => speak(ex.audioText)} lang="fr">
          Réécouter ▷
        </button>
      )
      interaction = renderOptions()
    } else if (ex.type === EXERCISE_TYPES.spelling) {
      stage = (
        <p className="vpl-cue vpl-cue-lg">
          {ex.prompt}
          {posLabel(current.word) ? <span className="vpl-cue-pos"> · {posLabel(current.word)}</span> : null}
        </p>
      )
      interaction = (
        <div className="vpl-write">
          <input
            ref={inputRef}
            className="vpl-input"
            lang="fr"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitSpelling() }}
            disabled={fb}
            placeholder="tapez le mot…"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="法语拼写输入"
          />
          {!fb ? (
            <button type="button" className="text-action vpl-verify" onClick={submitSpelling} lang="fr">Vérifier&nbsp;&nbsp;↵</button>
          ) : null}
        </div>
      )
    } else if (ex.type === EXERCISE_TYPES.build) {
      const map = Object.fromEntries(ex.bank.map((t) => [t.id, t.w]))
      stage = <p className="vpl-cue vpl-cue-lg">{current.word?.exampleZh}</p>
      interaction = (
        <div className="vpl-build">
          <div className="vpl-build-line" lang="fr">
            {chosen.length
              ? chosen.map((id) => (
                <button key={id} type="button" className="vpl-tile is-chosen" onClick={() => tapTile(id)} disabled={fb}>{map[id]}</button>
              ))
              : <span className="vpl-build-placeholder">点词块组句…</span>}
          </div>
          <div className="vpl-build-bank" lang="fr">
            {ex.bank.filter((t) => !chosen.includes(t.id)).map((t) => (
              <button key={t.id} type="button" className="vpl-tile" onClick={() => tapTile(t.id)} disabled={fb}>{t.w}</button>
            ))}
          </div>
          {!fb ? (
            <button type="button" className="text-action vpl-verify" onClick={submitBuild} disabled={!chosen.length} lang="fr">Vérifier&nbsp;&nbsp;↵</button>
          ) : null}
        </div>
      )
    }

    return (
      <div className={`vpl-card${isChoice || ex.type === EXERCISE_TYPES.match ? '' : ' vpl-card-narrow'}`} key={`ex-${i}`}>
        <div className="vpl-stagezone">
          <p className="page-kicker"><span lang="fr">{kfr}</span> · {kzh}</p>
          {stage}
        </div>
        <div className="vpl-divider" aria-hidden="true" />
        <div className="vpl-interzone">
          {interaction}
          {renderFeedback()}
        </div>
      </div>
    )
  }

  // 通知卡(未登录/加载/异常态)。
  function notice(children) {
    return <div className="vpl-card vpl-card-notice">{children}</div>
  }

  let body = null
  if (authLoading || authError) {
    body = notice(<AuthStatus className="page-notice" />)
  } else if (!user) {
    body = notice(
      <>
        <p className="page-kicker" lang="fr">Connexion requise</p>
        <p className="page-notice">背词进度按账号保存,请先登录。</p>
        <Link className="text-action" to="/login">Connexion&nbsp;&nbsp;→</Link>
      </>,
    )
  } else if (status === 'loading' || (sessionOwnerId !== userId && !['disabled', 'compat', 'error'].includes(status))) {
    body = notice(<p className="page-notice">正在加载你的背词进度…</p>)
  } else if (status === 'disabled') {
    body = notice(<p className="page-notice">站点尚未配置 Supabase,背词功能暂不可用。</p>)
  } else if (status === 'compat') {
    body = notice(
      <p className="page-notice">背词进度服务暂不可用，请稍后再来。</p>,
    )
  } else if (status === 'error') {
    body = notice(
      <>
        <p className="page-notice">出错了:{errorMessage}</p>
        <button type="button" className="text-action" onClick={() => load()}>Réessayer&nbsp;&nbsp;→</button>
      </>,
    )
  } else if (status === 'empty') {
    body = notice(
      <>
        <p className="page-notice">这个范围今天没有要背的词了。换个级别、主题,或明天再来。</p>
        {renderFilters()}
      </>,
    )
  } else if (status === 'idle') {
    body = (
      <div className="vpl-card vpl-card-idle" key="idle">
        <p className="page-kicker" lang="fr">Vocabulaire</p>
        <h1 className="vpl-title" lang="fr">Leçon du jour</h1>
        <p className="vpl-quota" lang="fr">{`Nouveaux ${newInQueue} · Révisions ${revInQueue}`}</p>
        {renderFilters()}
        <button type="button" className="text-action vpl-commencer" onClick={commencer} lang="fr">Commencer&nbsp;&nbsp;→</button>
      </div>
    )
  } else if (status === 'study' && studyList[studyIdx]) {
    const sw = studyList[studyIdx].word
    const last = studyIdx + 1 >= studyList.length
    body = (
      <div className="vpl-card vpl-card-study" key={`study-${studyIdx}`}>
        <div className="vpl-stagezone">
          <p className="page-kicker"><span lang="fr">Aperçu</span> · 先学一遍</p>
          <p className="vpl-word" lang="fr">{sw.french}</p>
          <div className="vpl-word-meta">
            {posLong(sw) ? <span lang="fr">{posLong(sw)}</span> : null}
            {sw.level ? <span>{sw.level}</span> : null}
            <button type="button" className="vpl-listen" onClick={() => speak(sw.french)} lang="fr">Écouter ▷</button>
          </div>
        </div>
        <div className="vpl-divider" aria-hidden="true" />
        <div className="vpl-interzone vpl-study-body">
          <p className="vpl-study-zh">{sw.chinese}</p>
          {sw.example ? <p className="vpl-study-example" lang="fr">{sw.example}</p> : null}
          {sw.exampleZh ? <p className="vpl-study-example-zh">{sw.exampleZh}</p> : null}
          {sw.note ? <p className="vpl-study-note">N.B. {sw.note}</p> : null}
          <div className="vpl-study-actions">
            <button type="button" className="text-action" onClick={studyNext} lang="fr">
              {last ? 'Commencer  →' : 'Suivant  →'}
            </button>
            <button type="button" className="vpl-chip" onClick={skipStudy}>跳过预习</button>
          </div>
        </div>
      </div>
    )
  } else if (status === 'ready' && current) {
    body = renderExercise()
  } else if (status === 'done') {
    body = (
      <div className="vpl-card vpl-card-done" key="done">
        <p className="page-kicker" lang="fr">Leçon terminée</p>
        <h1 className="vpl-title">本节完成</h1>
        <p className="vpl-done-score">答对 {stats.correct} / {stats.attempts} · 正确率 {acc} · 最高连击 ×{stats.maxCombo}</p>
        {deckStats ? (
          <p className="vpl-deckstats">
            已掌握 {deckStats.mastered} · 学习中 {deckStats.learning} · 新词 {deckStats.newCount} · 连续 {deckStats.streak} 天
          </p>
        ) : null}
        <div className="vpl-done-rule" aria-hidden="true" />
        {wrong.length ? (
          <>
            <p className="vpl-cue" lang="fr">À revoir · 需要复习</p>
            <div className="vpl-review">
              {wrong.map(({ word }) => (
                <div className="vpl-review-row" key={word.id}>
                  <span lang="fr">{word.french}</span>
                  <span className="vpl-review-zh">{word.chinese}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="vpl-cue">全部答对 —— 漂亮。</p>
        )}
        <div className="vpl-done-actions">
          {wrong.length ? <button type="button" className="text-action" onClick={retryWrong}>只练错词&nbsp;&nbsp;→</button> : null}
          <button type="button" className="text-action" onClick={() => load()} lang="fr">Encore&nbsp;&nbsp;→</button>
        </div>
        {renderFilters()}
      </div>
    )
  }

  return (
    <main className={`vpl${arrive ? ' page-arrive' : ''}`}>
      <PageNav title="Vocabulaire" onBack={goHome}>
        <span className="page-nav-side">{authLoading || authError ? '登录状态待确认' : user ? 'Connecté · 已登录' : '未登录'}</span>
      </PageNav>
      <div className="vpl-stage">{body}</div>
      <footer className="vpl-foot" aria-hidden={!progress}>
        {progress ? (
          <>
            <div className="vpl-progress" role="progressbar" aria-label="本轮进度" aria-valuenow={Math.round(progress.fill * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span className="vpl-progress-fill" style={{ width: `${Math.round(progress.fill * 100)}%` }} />
            </div>
            <span className="vpl-progress-label" lang="fr">{progress.label}</span>
          </>
        ) : null}
      </footer>
    </main>
  )
}
