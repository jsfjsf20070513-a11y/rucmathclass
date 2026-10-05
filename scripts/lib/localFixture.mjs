// 本地演示、浏览器检查和截图共用。所有写入只保存在这个进程内。
export const FIXTURE_TIME = '2026-10-05T04:00:00.000Z'
export const FIXTURE_PASSWORD = 'local-fixture-only'
export const FIXTURE_USERS = ['browser', 'other'].map((name, index) => ({
  id: `${index + 1}`.repeat(8) + `-${`${index + 1}`.repeat(4)}-4111-8111-111111111111`,
  aud: 'authenticated', role: 'authenticated', email: `${name}@example.invalid`,
  app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
}))

export const SCENES = {
  home: { title: '首页', path: '/', user: false },
  login: { title: '登录', path: '/login', user: false },
  signup: { title: '注册', path: '/login?aux=1', user: false },
  resources: { title: '书架', path: '/resources', user: false },
  'resources-error': { title: '增补书目读取失败', path: '/resources', user: false, resourcesUnavailable: true },
  vocabulary: { title: '背词首页', path: '/vocabulary' },
  'vocabulary-study': { title: '背词预习', path: '/vocabulary', study: true },
  'vocabulary-empty': { title: '今日没有待学词', path: '/vocabulary', emptyReviews: true },
  'vocabulary-save-error': { title: '背词保存失败', path: '/vocabulary', answer: true, reviewStatus: 503 },
  assistant: { title: '已有对话', path: '/assistant' },
  'assistant-empty': { title: '新对话', path: '/assistant', emptyHistory: true },
  'assistant-error': { title: '答疑请求失败', path: '/assistant', emptyHistory: true, chatStatus: 429 },
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
const initialHistory = () => [
  { id: 1, role: 'user', content: '给我一个简单的恒等式。', created_at: '2026-01-01T00:00:00Z' },
  { id: 2, role: 'model', content: '恒等式为 $1 + 1 = 2$。', created_at: '2026-01-01T00:00:01Z' },
]

export function createLocalFixture(fault = {}, { wordIds = [] } = {}) {
  const passwords = new Map(FIXTURE_USERS.map((user) => [user.id, FIXTURE_PASSWORD]))
  const histories = new Map(FIXTURE_USERS.map((user) => [user.id, fault.emptyHistory ? [] : initialHistory()]))
  const reviews = new Map(FIXTURE_USERS.map((user) => [user.id, new Map(fault.emptyReviews
    ? wordIds.map((word_id) => [word_id, { user_id: user.id, word_id, proficiency_level: 1, streak_count: 1, next_review_at: '2099-01-01T00:00:00Z', updated_at: FIXTURE_TIME, last_result: 'correct' }]) : [])]))
  let nextId = 3
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
      if (path === '/rest/v1/resources') return fault.resourcesUnavailable ? failure('fixture unavailable', 503) : response([])
      if (!user) return failure('登录状态已失效，请刷新页面并重新登录后再试。', 401)
      if (path === '/api/chat') {
        if (fault.chatStatus && fault.chatStatus !== 200) return failure(fault.chatStatus === 401 ? '登录状态已失效，请刷新页面并重新登录后再试。' : '请求太频繁，请稍后再试。', fault.chatStatus)
        return response({ text: '导数描述函数在某一点的变化率。' })
      }
      const owner = url.searchParams.get('user_id')
      if (owner && owner !== `eq.${user.id}`) return failure('假账号只能读取自己的记录。', 403)
      if (path === '/rest/v1/review_states') {
        const rows = reviews.get(user.id)
        const wordFilter = url.searchParams.get('word_id')
        if (method === 'GET') {
          const result = [...rows.values()].sort((a, b) => a.word_id.localeCompare(b.word_id)).filter((row) => !wordFilter || (wordFilter.startsWith('gt.') ? row.word_id > wordFilter.slice(3) : row.word_id === wordFilter.slice(3)))
          return response(headers.accept?.includes('vnd.pgrst.object') ? result[0] || null : result.slice(0, Number(url.searchParams.get('limit')) || 500))
        }
        if (body.user_id !== user.id) return failure('假账号不能修改别人的进度。', 403)
        if (fault.reviewStatus) return failure('fixture save unavailable', fault.reviewStatus)
        const previous = rows.get(body.word_id)
        if (method === 'POST' && previous) return failure('duplicate key', 409, '23505')
        if (method === 'PATCH' && (!previous || url.searchParams.get('updated_at') !== `eq.${previous.updated_at}`)) return response(null)
        if (!['POST', 'PATCH'].includes(method)) return failure('本地演示不支持此操作。', 405)
        rows.set(body.word_id, { ...body })
        return response(headers.accept?.includes('vnd.pgrst.object') ? body : [body], method === 'POST' ? 201 : 200)
      }
      if (path === '/rest/v1/ai_messages') {
        let history = histories.get(user.id)
        if (method === 'POST') {
          if (!Array.isArray(body) || body.some((row) => row.user_id !== user.id)) return failure('假账号不能修改别人的对话。', 403)
          history.push(...body.map((row) => ({ ...row, id: nextId++ })))
          return response(null, 201)
        }
        if (method === 'DELETE') {
          const cutoff = Number(url.searchParams.get('id')?.replace('lte.', ''))
          if (!Number.isFinite(cutoff)) return failure('清空对话必须指定最后一条记录。')
          histories.set(user.id, history.filter((row) => row.id > cutoff))
          return { status: 204 }
        }
        history = [...history].sort((a, b) => b.id - a.id).slice(0, Number(url.searchParams.get('limit')) || 200)
        if (url.searchParams.get('select') === 'id') history = history.map(({ id }) => ({ id }))
        return response(headers.accept?.includes('vnd.pgrst.object') ? history[0] || null : history)
      }
      return failure(`本地演示没有这个接口：${path}`, 404)
    },
  }
}
