import assert from 'node:assert/strict'

// Local browser checks only. Requests to fixture.invalid are fulfilled in the
// browser; these credentials cannot create a session against a real service.
export function createAccountFixture() {
  const user = {
    id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated',
    email: 'browser@example.invalid', app_metadata: {}, user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  }
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const expires = Math.floor(Date.now() / 1000) + 3600
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: user.aud, exp: expires })}.fixture`
  let history = [
    { id: 2, role: 'model', content: '恒等式为 $1 + 1 = 2$。', created_at: '2026-01-01T00:00:01Z' },
    { id: 1, role: 'user', content: '给我一个简单的恒等式。', created_at: '2026-01-01T00:00:00Z' },
  ]
  return {
    async handle(route) {
      const request = route.request()
      const url = new URL(request.url())
      if (url.hostname !== 'fixture.invalid') return false
      const method = request.method()
      if (url.pathname === '/auth/v1/token' && method === 'POST') {
        assert.equal(url.searchParams.get('grant_type'), 'password')
        assert.equal(request.postDataJSON().email, user.email)
        await route.fulfill({ json: { access_token: token, refresh_token: 'local-fixture', token_type: 'bearer', expires_in: 3600, expires_at: expires, user } })
      } else if (url.pathname === '/auth/v1/user' && method === 'GET') {
        await route.fulfill({ json: user })
      } else if (url.pathname === '/auth/v1/logout' && method === 'POST') {
        await route.fulfill({ status: 204 })
      } else if (url.pathname === '/rest/v1/review_states' && method === 'GET') {
        assert.equal(url.searchParams.get('user_id'), `eq.${user.id}`)
        await route.fulfill({ json: [] })
      } else if (url.pathname === '/rest/v1/ai_messages' && method === 'GET') {
        assert.equal(url.searchParams.get('user_id'), `eq.${user.id}`)
        await route.fulfill({ json: url.searchParams.get('select') === 'id' ? history.slice(0, 1).map(({ id }) => ({ id })) : history })
      } else if (url.pathname === '/rest/v1/ai_messages' && method === 'DELETE') {
        assert.equal(url.searchParams.get('user_id'), `eq.${user.id}`)
        assert.equal(url.searchParams.get('id'), 'lte.2')
        history = []
        await route.fulfill({ status: 204 })
      } else return false
      return true
    },
  }
}
