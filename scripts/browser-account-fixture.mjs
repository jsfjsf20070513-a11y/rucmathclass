import { createLocalFixture } from './lib/localFixture.mjs'

// 生产构建的检查仍用浏览器拦截；假数据与可手动操作的本地站共用。
export function createAccountFixture(fault) {
  const fixture = createLocalFixture(fault)
  return {
    async handle(route, localOrigin) {
      const request = route.request()
      const url = new URL(request.url())
      if (url.hostname !== 'fixture.invalid' && !(url.origin === localOrigin && /^\/api\/(?:lecture|resources)(?:\/|$)/.test(url.pathname))) return false
      const result = fixture.handle({
        url: request.url(), method: request.method(), headers: request.headers(),
        body: request.postData() ? request.postDataJSON() : {},
      })
      await route.fulfill(result.status === 204 ? { status: 204 } : result)
      return true
    },
  }
}
