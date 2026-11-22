import { staticResourceCatalog } from '../../src/data/resourceCatalog.js'
import { lectureSamples } from '../../src/data/lectureSamples.js'
import { lectureSummary } from '../../worker/src/lectureStore.js'

// 本地演示、浏览器检查和截图共用。所有写入只保存在这个进程内。
export const FIXTURE_TIME = '2026-11-20T04:00:00.000Z'
export const FIXTURE_PASSWORD = 'local-fixture-only'
export const FIXTURE_USERS = ['browser', 'other'].map((name, index) => ({
  id: `${index + 1}`.repeat(8) + `-${`${index + 1}`.repeat(4)}-4111-8111-111111111111`,
  aud: 'authenticated', role: 'authenticated', email: `${name}@example.invalid`,
  app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
}))

export const MATH_THREAD = 'a1111111-1111-4111-8111-111111111111'
const mathPath = '/assistant/' + MATH_THREAD
export const SCENES = {
  home: { title: '首页', path: '/', user: false },
  login: { title: '登录', path: '/login', user: false },
  'login-error': { title: '邮箱或密码错误', path: '/login', user: false, loginError: true },
  signup: { title: '注册', path: '/login?aux=1', user: false },
  'signup-submitted': { title: '注册请求已提交', path: '/login?aux=1', user: false, signupSubmitted: true },
  resources: { title: '书架', path: '/resources', user: false },
  'resources-slash': { title: '书架地址末尾带斜线', path: '/resources/', user: false },
  'resources-error': { title: '书目读取失败', path: '/resources', user: false, resourcesUnavailable: true },
  lecture: { title: '每日阅读档案', path: '/lecture' },
  'lecture-day': { title: '每日阅读正面', path: '/lecture/2026-11-20' },
  'lecture-verso': { title: '每日阅读背面', path: '/lecture/2026-11-20', verso: true },
  assistant: { title: '答疑目录', path: '/assistant' },
  'assistant-list': { title: '对话列表', path: '/assistant' },
  'assistant-thread': { title: '数学对话', path: mathPath },
  'assistant-new': { title: '新对话', path: '/assistant/new', emptyHistory: true },
  'assistant-delete': { title: '删除一段对话', path: '/assistant', revealDelete: true },
  'assistant-empty': { title: '新对话', path: '/assistant/new', emptyHistory: true },
  'assistant-error': { title: '答疑请求失败', path: '/assistant/new', emptyHistory: true, chatStatus: 429 },
  'assistant-unavailable': { title: '答疑服务不可用', path: '/assistant/new', emptyHistory: true, chatStatus: 500, chatError: 'Server not configured' },
  'reset-password': { title: '设置密码', path: '/reset-password' },
}

export function fixtureSession(user = FIXTURE_USERS[0]) {
  const expires = 4102444800
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const access_token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: user.aud, exp: expires })}.fixture`
  return { access_token, refresh_token: `fixture-${user.id}`, token_type: 'bearer', expires_in: 3600, expires_at: expires, user }
}

const response = (json, status = 200) => ({ status, json })
const failure = (message, status = 400, code = 'fixture_error') => response({ message, error: message, code }, status)
const samples = [
  {
    id: 'c3333333-3333-4333-8333-333333333333', date: '2026-11-16',
    question: '今天先聊点别的。你喜欢雨声吗？',
    reply: '小雨落在树叶上的声音很轻，适合一边听一边看书。你呢？',
  },
  {
    id: 'b2222222-2222-4222-8222-222222222222', date: '2026-11-18',
    question: 'Le mot « valeur » est masculin ou féminin ?',
    reply: 'On dit **« une valeur singulière »**. Le nom « valeur » est féminin.',
  },
  {
    id: MATH_THREAD, date: '2026-11-20', question: '算奇异值时，为什么要开平方？',
    reply: String.raw`先看单位向量经过实矩阵 $A$ 变换后的**长度**。

1. 取 $A^{\mathsf T}A$ 的单位特征向量 $v$，记对应的特征值为 $\lambda$。
2. 计算 $Av$ 的长度平方，用 $v^{\mathsf T}v=1$ 化简。

$$\|Av\|^2=v^{\mathsf T}(A^{\mathsf T}A)v=\lambda.$$

沿这个方向的伸缩倍数就是奇异值，因此要取非负平方根 $\sqrt{\lambda}$。

| 特征值 λ | 奇异值 σ |
| --- | --- |
| 9 | 3 |
| 4 | 2 |`,
  },
]

export function createLocalFixture(fault = {}) {
  const passwords = new Map(FIXTURE_USERS.map((user) => [user.id, FIXTURE_PASSWORD]))
  const histories = new Map()
  const conversations = new Map()
  let nextId = 1
  for (const user of FIXTURE_USERS) {
    const entries = new Map(), messages = []
    if (!fault.emptyHistory && user === FIXTURE_USERS[0]) {
      for (const { id, date, question, reply } of samples) {
        const start = date + 'T04:00:00.000Z', end = date + 'T04:00:01.000Z'
        entries.set(id, { id, title: question, created_at: start, updated_at: end })
        messages.push({ id: nextId++, conversation_id: id, role: 'user', content: question, created_at: start },
          { id: nextId++, conversation_id: id, role: 'model', content: reply, created_at: end })
      }
    }
    conversations.set(user.id, entries)
    histories.set(user.id, messages)
  }
  const answers = new Map(FIXTURE_USERS.map((user) => [user.id, new Map()]))
  return {
    handle({ url: input, method = 'GET', headers = {}, body = {} }) {
      const url = new URL(input, 'https://fixture.invalid')
      const path = url.pathname.replace(/^\/__demo/, '')
      const token = headers.authorization?.replace(/^Bearer /i, '')
      const user = FIXTURE_USERS.find((candidate) => fixtureSession(candidate).access_token === token)
      if (path === '/auth/v1/token' || path === '/auth/v1/verify') {
        const account = FIXTURE_USERS.find((candidate) => candidate.email === body.email || `fixture-${candidate.id}` === body.refresh_token)
        if (!account || (body.password !== undefined && body.password !== passwords.get(account.id)) || (body.token !== undefined && body.token !== '123456')) return failure('Invalid login credentials', 400, 'invalid_credentials')
        return response(fixtureSession(account))
      }
      if (path === '/auth/v1/signup') return response({ user: { ...FIXTURE_USERS[0], email: body.email }, session: null })
      if (path === '/auth/v1/otp' || path === '/auth/v1/recover') return response({})
      if (path === '/auth/v1/logout') return { status: 204 }
      if (path === '/auth/v1/user') {
        if (!user) return failure('登录状态已失效。', 401)
        if (method === 'PUT' && body.password) passwords.set(user.id, body.password)
        return response(user)
      }
      if (path === '/api/lecture' || path.startsWith('/api/lecture/')) {
        if (method !== 'GET') return response(null, 405)
        if (fault.lectureStatus) return response(null, fault.lectureStatus)
        const published = (fault.lectureDays || lectureSamples).filter((item) => item.date <= FIXTURE_TIME.slice(0, 10))
        if (path === '/api/lecture') return response(published.map(lectureSummary))
        const article = published.find((day) => path === '/api/lecture/' + day.date)
        return article ? response(article) : response(null, 404)
      }
      if (path === '/api/resources') {
        if (method !== 'GET') return response(null, 405)
        return fault.resourcesUnavailable ? failure('fixture unavailable', 503) : response(staticResourceCatalog)
      }
      if (!user) return failure('登录状态已失效，请刷新页面并重新登录后再试。', 401)
      if (path === '/api/chat') {
        if (fault.chatStatus && fault.chatStatus !== 200) return failure(fault.chatError || (fault.chatStatus === 401 ? '登录状态已失效，请刷新页面并重新登录后再试。' : '请求太频繁，请稍后再试。'), fault.chatStatus)
        return response({ text: fault.chatReply || '导数描述函数在某一点的变化率。' })
      }
      const owner = url.searchParams.get('user_id')
      if (owner && owner !== `eq.${user.id}`) return failure('假账号只能读取自己的记录。', 403)
      if (path === '/rest/v1/lecture_answers') {
        if (fault.answersStatus) return failure('lecture_answers unavailable', fault.answersStatus)
        const rows = answers.get(user.id)
        const date = url.searchParams.get('day')?.slice(3) || body.day
        const previous = rows.get(date)
        const single = headers.accept?.includes('vnd.pgrst.object')
        const result = (row, status) => response(single ? row || null : row ? [row] : [], status)
        if (method === 'GET') return date ? result(previous) : response([...rows.values()])
        if ((method === 'POST' || body.user_id) && body.user_id !== user.id) return failure('账号不符', 403)
        if (method === 'POST') {
          if (previous) return failure('duplicate key', 409, '23505')
        } else if (method === 'PATCH') {
          if (!previous || url.searchParams.get('updated_at') !== 'eq.' + previous.updated_at) return result(null)
        } else return failure('本地演示不支持此操作。', 405)
        const row = { ...previous, ...body }
        rows.set(date, row)
        return result(row, method === 'POST' ? 201 : 200)
      }
      const entries = conversations.get(user.id)
      if (path === '/rest/v1/ai_conversations') {
        if (fault.legacyAssistant) return failure('Table missing from schema cache', 404, 'PGRST205')
        if (method === 'DELETE') {
          const id = url.searchParams.get('id')?.slice(3)
          const entry = entries.get(id)
          if (!entry || url.searchParams.get('updated_at') !== 'eq.' + entry.updated_at) return response([])
          entries.delete(id)
          histories.set(user.id, histories.get(user.id).filter((message) => message.conversation_id !== id))
          return response([{ id }])
        }
        if (method !== 'GET') return failure('不支持的目录操作', 405)
        const after = url.searchParams.get('id')?.slice(3)
        const sorted = [...entries.values()].filter((entry) => !after || entry.id > after).sort((a, b) => a.id.localeCompare(b.id))
        return response(sorted.slice(0, Number(url.searchParams.get('limit')) || 1000))
      }
      if (path === '/rest/v1/rpc/save_ai_turn' && method === 'POST') {
        const { p_id: id, p_title: title, p_question: question, p_reply: reply } = body
        if (body.p_user_id !== user.id) return failure('账号不符', 403)
        const previous = entries.get(id)
        if (!previous && (!title || [...conversations.values()].some((rows) => rows.has(id)))) return failure('对话不可用', 404)
        if (fault.saveStatus) return failure('写入失败', fault.saveStatus)
        const start = Math.max(Date.now(), previous ? Date.parse(previous.updated_at) + 1 : 0)
        const created = new Date(start).toISOString(), updated = new Date(start + 1).toISOString()
        entries.set(id, { id, title: previous?.title || title, created_at: previous?.created_at || created, updated_at: updated })
        histories.get(user.id).push({ id: nextId++, conversation_id: id, role: 'user', content: question, created_at: created },
          { id: nextId++, conversation_id: id, role: 'model', content: reply, created_at: updated })
        return response(updated)
      }
      if (path === '/rest/v1/ai_messages') {
        let history = histories.get(user.id)
        if (method === 'POST') {
          if (!Array.isArray(body) || body.some((row) => row.user_id !== user.id)) return failure('假账号不能修改别人的对话。', 403)
          const rows = body.map((row) => ({ ...row, id: nextId++ }))
          history.push(...rows)
          return response(url.searchParams.get('select') === 'id' ? rows.map(({ id }) => ({ id })) : null, 201)
        }
        if (method === 'DELETE') {
          const cutoff = Number(url.searchParams.get('id')?.replace('lte.', ''))
          if (!Number.isFinite(cutoff)) return failure('清空对话必须指定最后一条记录。')
          histories.set(user.id, history.filter((row) => row.id > cutoff))
          return { status: 204 }
        }
        const id = url.searchParams.get('conversation_id')?.slice(3)
        const role = url.searchParams.get('role')?.slice(3)
        const order = url.searchParams.get('order') || 'id.desc'
        const direction = order.startsWith('created_at.asc') ? 1 : -1
        history = history.filter((row) => (!id || row.conversation_id === id) && (!role || row.role === role))
          .sort((a, b) => {
            const dateOrder = order.startsWith('created_at.') ? a.created_at.localeCompare(b.created_at) : 0
            return direction * (dateOrder || a.id - b.id)
          }).slice(0, Number(url.searchParams.get('limit')) || 200)
        if (url.searchParams.get('select') === 'id') history = history.map(({ id }) => ({ id }))
        return response(headers.accept?.includes('vnd.pgrst.object') ? history[0] || null : history)
      }
      return failure(`本地演示没有这个接口：${path}`, 404)
    },
  }
}
