import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { frenchVocabulary } from '../../src/data/frenchVocabulary.js'
import { createLocalFixture, fixtureSession, SCENES } from './localFixture.mjs'

export const projectRoot = fileURLToPath(new URL('../..', import.meta.url))

function bootstrap({ session, key, runId, scene }) {
  window.__MATHCLASS_DEMO_URL__ = window.location.origin + '/__demo'
  window.__MATHCLASS_DEMO_CHAT__ = window.location.origin + '/__demo/api/chat'
  const marker = 'mathclass-demo-run'
  if (localStorage.getItem(marker) !== runId) {
    for (const name of Object.keys(localStorage)) {
      if (name === key || name.startsWith('mcw_vocab_session_')) localStorage.removeItem(name)
    }
    if (session) localStorage.setItem(key, JSON.stringify(session))
    localStorage.setItem(marker, runId)
  }
  localStorage.setItem('mcw_weather_cache', JSON.stringify({ at: Date.now(), w: { temp: 20, code: 0, isDay: 1 } }))
  if ((scene.study || scene.answer) && !localStorage.getItem(`mcw_vocab_session_v2:${session.user.id}`)) {
    localStorage.setItem(`mcw_vocab_session_v2:${session.user.id}`, JSON.stringify({
      v: 2, userId: session.user.id,
      day: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
      status: scene.study ? 'study' : 'ready', level: 'all', queue: [{ id: 'fr-bonjour' }],
      i: 0, studyIdx: 0, stats: { correct: 0, attempts: 0, combo: 0, maxCombo: 0 }, wrongIds: [],
    }))
  }
}

export async function startDemo({ root = projectRoot, scene: sceneName = 'home', port = 0, cacheDir } = {}) {
  root = await realpath(root)
  const scene = SCENES[sceneName]
  if (!scene) throw new Error(`没有这个场景：${sceneName}。运行 npm run demo -- --help 查看。`)
  const fixture = createLocalFixture(scene, { wordIds: frenchVocabulary.map(({ id }) => id) })
  const runId = randomUUID()
  let origin
  const server = await createServer({
    root, configFile: false, envFile: false, mode: 'demo',
    cacheDir: cacheDir || join(projectRoot, '.cache/demo-vite'),
    define: {
      'import.meta.env.VITE_SUPABASE_URL': 'window.__MATHCLASS_DEMO_URL__',
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('local-fixture'),
      'import.meta.env.VITE_AI_ENDPOINT': 'window.__MATHCLASS_DEMO_CHAT__',
    },
    plugins: [react(), {
      name: 'local-fixture',
      transformIndexHtml() {
        const data = { session: scene.user === false ? null : fixtureSession(), key: 'sb-127-auth-token', runId, scene }
        return [{ tag: 'script', children: `(${bootstrap.toString()})(${JSON.stringify(data).replaceAll('<', '\\u003c')})`, injectTo: 'head-prepend' }]
      },
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'")
          if (!req.url?.startsWith('/__demo/')) return next()
          if (req.headers.origin && req.headers.origin !== origin) { res.statusCode = 403; res.end('只接受本地演示页面的请求。'); return }
          try {
            let body = ''
            for await (const chunk of req) {
              body += chunk
              if (body.length > 2 * 1024 * 1024) { res.statusCode = 413; res.end(); return }
            }
            const result = fixture.handle({ url: req.url, method: req.method, headers: req.headers, body: body ? JSON.parse(body) : {} })
            res.statusCode = result.status
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(result.status === 204 ? undefined : JSON.stringify(result.json))
          } catch {
            res.statusCode = 400
            res.end(JSON.stringify({ message: '本地演示无法读取这个请求。' }))
          }
        })
      },
    }],
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false, cors: false, fs: { allow: [root, join(projectRoot, 'node_modules')] } },
  })
  try {
    await server.listen()
    origin = `http://127.0.0.1:${server.httpServer.address().port}`
    return { origin, url: origin + scene.path, scene, close: () => server.close() }
  } catch (error) {
    await server.close()
    throw error
  }
}
