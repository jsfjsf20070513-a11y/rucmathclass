import { createLocalFixture } from './lib/localFixture.mjs'

// 生产构建的检查仍用浏览器拦截；假数据与可手动操作的本地站共用。
export function createAccountFixture(fault) {
  const fixture = createLocalFixture(fault)
  return {
    async handle(route) {
      const request = route.request()
      if (new URL(request.url()).hostname !== 'fixture.invalid') return false
      const result = fixture.handle({
        url: request.url(), method: request.method(), headers: request.headers(),
        body: request.postData() ? request.postDataJSON() : {},
      })
      await route.fulfill(result.status === 204 ? { status: 204 } : result)
      return true
    },
  }
}
