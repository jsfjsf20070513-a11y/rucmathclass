import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { signIn, authErrorMessage } from '../lib/authBackend'
import AuthStatus from '../components/AuthStatus'
import { dailyTheoremNotes } from '../data/dailyTheoremNotes.generated'
import { paroles } from '../data/siteContent'
import { portraits, portraitSrc } from '../data/portraits'
import { resourceCategories } from '../data/resourceCatalog'
import { usePageFlip } from '../hooks/usePageFlip'
import { startWeatherCanvas, weatherInkFor } from '../lib/weatherCanvas'
import { flipNavFrom, markFlipNav } from '../lib/flipNav'

// 扉页：全屏横翻，各页样式在 App.css 的 .mag 下。
// 一本 5 页横翻的美术馆图录 + 撕开进入的 Connexion 屏。100svh 无纵向滚动。
// 01 封面(60 人肖像墙 + 天气 canvas)/ 02 Vocabulaire / 03 Théorème /
// 04 Bibliothèque / 05 Parole(木色)→ 撕开 → 06 Connexion(原地对接 auth)。

const DAY_IN_MS = 24 * 60 * 60 * 1000
const THEOREM_ROTATION_START_DAY = Math.floor(Date.UTC(2025, 8, 1) / DAY_IN_MS)
const WEATHER_CACHE_KEY = 'mcw_weather_cache'
const WEATHER_CACHE_MS = 3 * 3600 * 1000
// 未登录 5 页;登录后插入 05 Correspondance(AI 答疑之门),Parole 顺延为 06 压卷。
const SIDES_BASE = ['none', 'right', 'left', 'top', 'bottom']
const SIDES_FULL = ['none', 'right', 'left', 'top', 'left', 'bottom']
// ← Accueil 按来路落页:从背词回 02、从书目回 04、从答疑回 05、从登录回压卷 Parole。
const returnPageFor = (from, hasAssistant) => ({
  '/vocabulary': 1,
  '/resources': 3,
  '/assistant': hasAssistant ? 4 : 1,
  '/login': hasAssistant ? 5 : 4,
}[from] ?? 0)
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

function getShanghaiDaySerial(reference = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(reference)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  )

  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_IN_MS)
}

function getRotatingTheoremIndex(length) {
  if (!length) {
    return 0
  }

  const dayOffset = getShanghaiDaySerial() - THEOREM_ROTATION_START_DAY
  return ((dayOffset % length) + length) % length
}

function getEditionDateLabel() {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Asia/Shanghai',
    month: 'long',
    day: 'numeric',
  }).format(new Date())
}

function readCachedWeather() {
  try {
    const raw = window.localStorage.getItem(WEATHER_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && Date.now() - parsed.at < WEATHER_CACHE_MS) return parsed.w
  } catch {
    // storage unavailable
  }
  return null
}

export default function Home() {
  const navigate = useNavigate()
  const { user, signOut, isAuthEnabled, loading: sessionLoading, error: sessionError, signingOut, signOutError } = useAuth()
  const [weather, setWeather] = useState(() => readCachedWeather())
  const hasAssistant = Boolean(user)
  // 站内返回:按来路直落对应页,整册从左侧翻入(反向对称)。
  const [entry] = useState(() => {
    const from = flipNavFrom()
    return { back: Boolean(from), from, page: from ? returnPageFor(from, Boolean(user)) : 0 }
  })
  const [connexionOpen, setConnexionOpen] = useState(false)

  // Connexion 屏(原地渲染,对接 Supabase auth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const authAttempt = useRef(0)
  const authPending = useRef(false)
  useEffect(() => {
    authAttempt.current += 1
    authPending.current = false
    setEmail('')
    setPassword('')
    setAuthError('')
    setAuthLoading(false)
    return () => { authAttempt.current += 1 }
  }, [user?.id])

  const canvasRef = useRef(null)
  const coverContentRef = useRef(null)
  const paroleRef = useRef(null)
  const loginRef = useRef(null)
  const entranceStartedRef = useRef(false)
  const splittingRef = useRef(false)

  const corIdx = 4
  const paroleIdx = hasAssistant ? 5 : 4
  const pageCount = hasAssistant ? 6 : 5
  const { page, next, prev, jumpTo, setPageEl } = usePageFlip({
    count: pageCount,
    sides: hasAssistant ? SIDES_FULL : SIDES_BASE,
    durationMs: 900,
    enabled: !connexionOpen,
    initialPage: entry.page,
  })

  // 登录态迁移时页序移位:登录(auth 迟到水合)→ Correspondance 插入 04 之后,
  // 当前页与来路直跳校正;登出 → 收回一页,越界收敛到 Parole。全部无动画直跳。
  const hasAssistantRef = useRef(hasAssistant)
  useEffect(() => {
    const had = hasAssistantRef.current
    hasAssistantRef.current = hasAssistant
    if (hasAssistant && !had) {
      if (entry.from === '/assistant' && page < corIdx) jumpTo(corIdx)
      else if (page >= corIdx) jumpTo(page + 1)
    } else if (!hasAssistant && had && page > 4) {
      jumpTo(4)
    }
  }, [hasAssistant, page, entry.from, jumpTo])

  const dailyTheorem = dailyTheoremNotes[getRotatingTheoremIndex(dailyTheoremNotes.length)]
  const editionDateLabel = getEditionDateLabel()
  const [parole] = useState(() => paroles[Math.floor(Math.random() * paroles.length)])
  const coverInk = weatherInkFor(weather)
  const displayName = user?.user_metadata?.nickname || user?.user_metadata?.real_name || user?.email || ''

  // 入场契约:文字与天气一起淡入(1.1s);API 超 1.2s 兜底直显。
  const startEntrance = useCallback(() => {
    if (entranceStartedRef.current) return
    entranceStartedRef.current = true
    const cc = coverContentRef.current
    if (!cc) return
    cc.style.transition = 'opacity 1.1s ease'
    requestAnimationFrame(() => requestAnimationFrame(() => { cc.style.opacity = '1' }))
    window.setTimeout(() => { cc.style.transition = 'none' }, 1300)
  }, [])

  useEffect(() => {
    if (weather) startEntrance()
    const fallback = window.setTimeout(startEntrance, 1200)
    const controller = new AbortController()
    fetch('https://api.open-meteo.com/v1/forecast?latitude=31.30&longitude=120.62&current=temperature_2m,weather_code,is_day&timezone=Asia/Shanghai', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (!data?.current) return
        const fresh = {
          temp: Math.round(data.current.temperature_2m),
          code: data.current.weather_code,
          isDay: data.current.is_day,
        }
        try {
          window.localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ at: Date.now(), w: fresh }))
        } catch {
          // ignore
        }
        setWeather((prevW) => {
          if (prevW && prevW.temp === fresh.temp && prevW.code === fresh.code && prevW.isDay === fresh.isDay) {
            return prevW
          }
          return fresh
        })
        startEntrance()
      })
      .catch(() => {})
    return () => {
      window.clearTimeout(fallback)
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startEntrance])

  // 天气粒子:weather 就绪后启动;移动端粒子数减半;
  // 只在封面页跑 rAF——翻进内页时封面已隐藏,继续画就是白烧 GPU。
  useEffect(() => {
    if (!weather || !canvasRef.current || page !== 0) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const particleScale = window.innerWidth < 720 ? 0.5 : 1
    return startWeatherCanvas(canvasRef.current, weather, { particleScale })
  }, [weather, page])

  // 站内衔接:立即跳转,由目标页翻入盖上来——不翻出当前页,
  // 否则会先露出底下的肖像墙再切换(用户:不利落)。
  const flipNavigate = useCallback((to) => {
    markFlipNav('/')
    navigate(to)
  }, [navigate])

  // Connexion 撕开转场:克隆 Parole 两半,双半外翻露出底下的登录屏;Retour 反向合拢。
  const splitParole = useCallback((open) => {
    const parole5 = paroleRef.current
    const login = loginRef.current
    if (!parole5 || !login || splittingRef.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      login.style.visibility = open ? 'visible' : 'hidden'
      setConnexionOpen(open)
      return
    }
    splittingRef.current = true
    const parent = parole5.parentElement
    const OUT_L = 'translateX(-58%) rotate(-1.6deg)'
    const OUT_R = 'translateX(58%) rotate(1.6deg)'
    const mk = (clipRight) => {
      const c = parole5.cloneNode(true)
      c.style.zIndex = '60'
      c.style.transition = 'none'
      c.style.transform = open ? 'none' : (clipRight ? OUT_R : OUT_L)
      c.style.clipPath = clipRight ? 'inset(0 0 0 50%)' : 'inset(0 50% 0 0)'
      c.style.pointerEvents = 'none'
      c.style.willChange = 'transform'
      c.style.opacity = '1'
      parent.appendChild(c)
      return c
    }
    const l = mk(false)
    const r = mk(true)
    if (open) login.style.visibility = 'visible'
    requestAnimationFrame(() => {
      l.getBoundingClientRect()
      const tr = `transform 0.62s cubic-bezier(0.45, 0, 0.12, 1)`
      l.style.transition = tr
      r.style.transition = tr
      l.style.transform = open ? OUT_L : 'translateX(0) rotate(0deg)'
      r.style.transform = open ? OUT_R : 'translateX(0) rotate(0deg)'
    })
    window.setTimeout(() => {
      if (!open) login.style.visibility = 'hidden'
      l.remove()
      r.remove()
      splittingRef.current = false
      setConnexionOpen(open)
    }, 650)
  }, [])

  useEffect(() => {
    if (!user || !connexionOpen) return undefined
    const timer = window.setTimeout(() => splitParole(false), 500)
    return () => window.clearTimeout(timer)
  }, [user, connexionOpen, splitParole])

  const handleConnexion = useCallback(async (event) => {
    event.preventDefault()
    if (authPending.current || sessionLoading) return
    if (!isAuthEnabled) {
      setAuthError('站点尚未配置登录服务。')
      return
    }
    const attempt = ++authAttempt.current
    authPending.current = true
    setAuthLoading(true)
    setAuthError('')
    try {
      await signIn(email, password)
      if (attempt === authAttempt.current) setPassword('')
    } catch (error) {
      if (attempt === authAttempt.current) setAuthError(authErrorMessage(error))
    } finally {
      if (attempt === authAttempt.current) {
        authPending.current = false
        setAuthLoading(false)
      }
    }
  }, [email, password, sessionLoading, isAuthEnabled])

  const folio = `0${page + 1} — 0${pageCount}`

  return (
    <div className={`mag${entry.back ? ' mag-arrive-back' : ''}`}>
      {/* ── 01 封面:肖像长墙 ── */}
      <section ref={setPageEl(0)} className="mag-page mag-cover" style={{ zIndex: 10 }} aria-label="封面">
        <canvas ref={canvasRef} className="mag-weather" />
        <div className="mag-wall" aria-hidden="true">
          {portraits.map((p) => (
            <div key={p.slug} className="mag-wall-cell">
              <img
                src={portraitSrc(p.slug)}
                alt=""
                loading="eager"
                decoding="async"
                draggable={false}
                onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
              />
            </div>
          ))}
        </div>
        <div className="mag-fade mag-fade-top" aria-hidden="true" />
        <div className="mag-fade mag-fade-bottom" aria-hidden="true" />
        <nav className="mag-cover-nav" aria-label="封面导航">
          <span>Accueil</span>
          {weather ? (
            <span className="mag-cover-weather" style={{ color: coverInk }}>
              {`Suzhou\u00A0${weather.temp}℃`}
            </span>
          ) : <span />}
        </nav>
        <div ref={coverContentRef} className="mag-cover-content">
          <h1 className="mag-masthead">Math</h1>
          <div className="mag-edition">
            <span className="mag-edition-rule" aria-hidden="true" />
            <p lang="fr" style={{ color: 'rgba(111,103,94,0.75)' }}>{`Édition du ${editionDateLabel}`}</p>
            <span className="mag-edition-rule" aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* ── 02 Vocabulaire(引导页,全页无汉字) ── */}
      <section ref={setPageEl(1)} className="mag-page mag-vocab" style={{ zIndex: 11, transform: entry.page >= 1 ? 'none' : 'translateX(105%) rotate(2.2deg)' }} aria-label="Vocabulaire">
        <div className="mag-vocab-inner">
          <div className="mag-pageno" data-animate=""><p>{`02 — 0${pageCount}`}</p></div>
          <div className="mag-rule" data-animate="" />
          <h2 className="mag-giant" lang="fr" data-animate="">Vocabulaire</h2>
          <div className="mag-vocab-foot" data-animate="">
            <p className="mag-vocab-quote" lang="fr">Dire les mathématiques en français, un mot à la fois.</p>
            <button
              type="button"
              className="mag-enter"
              lang="fr"
              onClick={() => flipNavigate('/vocabulary')}
            >
              Entrer&nbsp;&nbsp;→
            </button>
          </div>
        </div>
      </section>

      {/* ── 03 Théorème(完整契约:kicker/题/prelude/公式/note/折叠证明) ── */}
      <section ref={setPageEl(2)} className="mag-page mag-theorem" style={{ zIndex: 12, transform: entry.page >= 2 ? 'none' : 'translateX(-105%) rotate(-2.2deg)' }} aria-label="每日定理">
        <div className="mag-scroll" data-flip-scroll="">
          <div className="mag-theorem-inner">
            <p className="mag-kicker" lang="fr" data-animate="">Rappel mathématique</p>
            <h2 className="mag-theorem-title" data-animate="">{dailyTheorem.title}</h2>
            <div
              className="mag-theorem-formula"
              data-animate=""
              dangerouslySetInnerHTML={{ __html: dailyTheorem.displayHtml || dailyTheorem.fallback }}
            />
          </div>
        </div>
      </section>

      {/* ── 04 Bibliothèque(真实八书架索引) ── */}
      <section ref={setPageEl(3)} className="mag-page mag-biblio" style={{ zIndex: 13, transform: entry.page >= 3 ? 'none' : 'translateY(-105%) rotate(1.2deg)' }} aria-label="Bibliothèque">
        <div className="mag-biblio-inner">
          <p className="mag-kicker" lang="fr" data-animate="">Bibliothèque</p>
          <p className="mag-biblio-zh" data-animate="">资源与书目</p>
          <div className="mag-biblio-grid" data-animate="">
            {resourceCategories.map((category, index) => (
              <button
                key={category.label}
                type="button"
                className="mag-biblio-row"
                onClick={() => flipNavigate(`/resources#shelf-${index + 1}`)}
              >
                <span className="mag-biblio-roman">{ROMAN[index]}</span>
                <span className="mag-biblio-label">{category.label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mag-enter mag-biblio-enter"
            lang="fr"
            data-animate=""
            onClick={() => flipNavigate('/resources')}
          >
            Consulter&nbsp;&nbsp;→
          </button>
        </div>
      </section>

      {/* ── 05 Correspondance(登录后才存在的一页;AI 答疑之门,镜像 02) ── */}
      {hasAssistant ? (
        <section
          ref={setPageEl(corIdx)}
          className="mag-page mag-cor"
          style={{ zIndex: 10 + corIdx, transform: entry.page >= corIdx ? 'none' : 'translateX(-105%) rotate(-2.2deg)' }}
          aria-label="Correspondance"
        >
          <div className="mag-vocab-inner mag-cor-inner">
            <div className="mag-pageno" data-animate=""><p>{`05 — 0${pageCount}`}</p></div>
            <div className="mag-rule" data-animate="" />
            <h2 className="mag-giant" lang="fr" data-animate="">Correspondance</h2>
            <div className="mag-vocab-foot" data-animate="">
              <button type="button" className="mag-enter" lang="fr" onClick={() => flipNavigate('/assistant')}>
                Entrer&nbsp;&nbsp;→
              </button>
              <p className="mag-vocab-quote" lang="fr">Pose une question de maths ou de français — en chinois ou en français.</p>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── 压卷 Parole(木色卡片页;登录后为 06) ── */}
      <section
        ref={(el) => { setPageEl(paroleIdx)(el); paroleRef.current = el }}
        className="mag-page mag-parole"
        style={{ zIndex: 10 + paroleIdx, transform: entry.page >= paroleIdx ? 'none' : 'translateY(105%) rotate(-1.2deg)' }}
        aria-label="Parole du jour"
      >
        <aside className="mag-parole-card" aria-label="Parole du jour">
          <p className="mag-parole-kicker" lang="fr" data-animate="">Parole du jour</p>
          <p className="mag-parole-text" lang="fr" data-animate="">{parole.text}</p>
          <p className="mag-parole-note" data-animate="">{parole.note}</p>
          <div className="mag-parole-rule" aria-hidden="true" />
          <p className="mag-parole-author" data-animate="">
            {parole.author}
            {parole.src ? ` · ${parole.src}` : ''}
          </p>
        </aside>
        <footer className="mag-parole-foot">
          {sessionLoading || sessionError ? <AuthStatus /> : user ? (
            <p>
              <span>已登录 · {displayName}</span>
              <button type="button" className="mag-parole-link" onClick={signOut} disabled={signingOut}>{signingOut ? '退出中…' : '退出'}</button>
            </p>
          ) : isAuthEnabled ? (
            <p>
              <button type="button" className="mag-parole-link" onClick={() => splitParole(true)}>
                Connexion · 登录
              </button>
            </p>
          ) : (
            <p><span>登录未启用</span></p>
          )}
          {signOutError ? <p className="mag-connexion-error" role="status">{signOutError}</p> : null}
        </footer>
      </section>

      {/* ── 06 Connexion(撕开后露出;原地对接 Supabase auth) ── */}
      <section ref={loginRef} className="mag-page mag-connexion" aria-label="Connexion">
        <form className="mag-connexion-box" onSubmit={handleConnexion}>
          <h2 className="mag-connexion-title" lang="fr">Connexion</h2>
          {user ? (
            <>
              <p className="mag-connexion-done">Connecté · 已登录 {displayName}</p>
              <button type="button" className="mag-enter" onClick={() => splitParole(false)} lang="fr">
                Retour&nbsp;→
              </button>
            </>
          ) : (
            <>
              <input
                type="email"
                disabled={authLoading}
                className="mag-connexion-input"
                placeholder="Adresse e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <input
                type="password"
                disabled={authLoading}
                className="mag-connexion-input"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              {authError ? <p className="mag-connexion-error">{authError}</p> : null}
              <button type="submit" className="mag-enter mag-connexion-submit" disabled={authLoading || sessionLoading} lang="fr">
                {authLoading ? 'Connexion…' : 'Entrer'}
              </button>
              <button
                type="button"
                className="mag-connexion-more"
                disabled={authLoading}
                onClick={() => flipNavigate('/login?aux=1')}
              >
                注册 / 验证码 / 找回密码 →
              </button>
            </>
          )}
          {!user ? (
            <button type="button" className="mag-connexion-back" onClick={() => splitParole(false)} lang="fr">
              ← Retour
            </button>
          ) : null}
        </form>
      </section>

      {/* ── folio 与翻页钮(不翻的常驻层) ── */}
      <div className="mag-folio" aria-hidden="true">{folio}</div>
      <div className="mag-controls">
        <button type="button" onClick={prev} aria-label="上一页" className="mag-arrow" disabled={page === 0}>‹</button>
        <button type="button" onClick={next} aria-label="下一页" className="mag-arrow is-next" disabled={page === pageCount - 1}>›</button>
      </div>
    </div>
  )
}
