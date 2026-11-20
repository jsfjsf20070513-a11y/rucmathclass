import { lectureSamples } from '../src/data/lectureSamples.js'
import assert from 'node:assert/strict'
import { fixtureSession, FIXTURE_PASSWORD, FIXTURE_USERS } from './lib/localFixture.mjs'

export async function checkRegressions({ scenario, baseUrl, rendered }) {
  const viewport = { width: 390, height: 844 }
  const session = fixtureSession()
  const signIn = (page) => page.addInitScript((session) => localStorage.setItem('sb-fixture-auth-token', JSON.stringify(session)), session)
  await scenario('readable-account-messages', viewport, async (page) => {
    await page.goto(`${baseUrl}/login`)
    await page.getByRole('textbox', { name: '邮箱', exact: true }).fill(FIXTURE_USERS[0].email)
    await page.getByPlaceholder('Mot de passe', { exact: true }).fill('wrong-password')
    await page.locator('button[type="submit"]').click()
    await page.getByText('邮箱或密码不正确。', { exact: true }).waitFor()
    await page.goto(`${baseUrl}/login?aux=1`)
    await page.getByRole('textbox', { name: '真实姓名', exact: true }).fill('演示同学')
    await page.getByRole('textbox', { name: '昵称', exact: true }).fill('本地演示')
    await page.getByRole('textbox', { name: '邮箱', exact: true }).fill(FIXTURE_USERS[0].email)
    await page.getByPlaceholder('Mot de passe', { exact: true }).fill(FIXTURE_PASSWORD)
    await page.getByPlaceholder('确认密码 · Confirmer', { exact: true }).fill(FIXTURE_PASSWORD)
    await page.locator('button[type="submit"]').click()
    await page.getByText('注册请求已提交。请查看邮箱，按邮件提示完成注册。', { exact: true }).waitFor()
    assert.equal(await page.getByPlaceholder('Mot de passe', { exact: true }).inputValue(), '')
  })

  await scenario('readable-assistant-error', viewport, async (page, fault) => {
    await signIn(page)
    fault.chatStatus = 500
    fault.chatError = 'Server not configured'
    await page.goto(`${baseUrl}/assistant`)
    const input = page.getByRole('textbox', { name: '向 AI 助手提问', exact: true })
    await input.fill('解释一下导数。')
    await input.press('Enter')
    await page.getByText('答疑暂时不可用，请稍后再试。', { exact: true }).waitFor()
    assert.equal(await input.inputValue(), '解释一下导数。', '失败后应保留问题')
    fault.chatStatus = 200
    await input.press('Enter')
    await page.getByText('导数描述函数在某一点的变化率。', { exact: true }).waitFor()
  })

  await scenario('chinese-input', viewport, async (page) => {
    await signIn(page)
    let sent = 0
    page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/chat') sent += 1 })
    await page.goto(`${baseUrl}/assistant`)
    const input = page.getByRole('textbox', { name: '向 AI 助手提问', exact: true })
    await input.fill('解释一下导数。')
    for (const properties of [{ isComposing: true }, { keyCode: 229 }]) {
      await input.dispatchEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...properties })
      await page.evaluate(() => new Promise(requestAnimationFrame))
      assert.equal(sent, 0, '输入法选词不应发送问题')
      assert.equal(await input.inputValue(), '解释一下导数。')
      assert.equal(await input.isEnabled(), true)
    }
    await input.press('Enter')
    await page.getByText('导数描述函数在某一点的变化率。', { exact: true }).waitFor()
    assert.equal(sent, 1)
  })

  await scenario('lecture-account-sync', viewport, async (page) => {
    const path = baseUrl + '/lecture/2026-11-19'
    const selected = '.lec-page:not([inert]) [aria-checked="true"]'
    const token = 'sb-fixture-auth-token'
    await page.goto(path)
    await page.locator('.lec-page:not([inert]) .lec-option').first().click()
    await page.locator(selected).waitFor()

    // 在登录页完成同步，然后清掉本机答案，以独立的云端重读验证归属。
    const upload = page.waitForResponse((r) => r.url().includes('/lecture_answers') && r.request().method() === 'POST' && r.ok())
    await page.goto(baseUrl + '/login')
    await page.getByRole('textbox', { name: '邮箱', exact: true }).fill(FIXTURE_USERS[0].email)
    await page.getByLabel('Mot de passe', { exact: true }).fill(FIXTURE_PASSWORD)
    await page.getByRole('button', { name: 'Entrer', exact: true }).click()
    await upload
    await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('mcw_lecture_answers_v2') || '{}'))
      .some((days) => days['2026-11-19']?.pending === false))
    await page.evaluate(() => localStorage.removeItem('mcw_lecture_answers_v2'))
    await page.goto(path)
    await page.locator(selected).waitFor()

    let release, started
    const blocked = new Promise((done) => { release = done })
    const writing = new Promise((done) => { started = done })
    await page.route('**/rest/v1/lecture_answers*', async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback()
      started()
      await blocked
      return route.fallback()
    })
    const changed = page.locator('.lec-page:not([inert]) .lec-option').nth(1)
    await changed.click()
    await writing
    assert.equal(await changed.getAttribute('aria-checked'), 'false')
    release()
    await page.waitForFunction(() => document.querySelectorAll('.lec-page:not([inert]) .lec-option')[1]?.getAttribute('aria-checked') === 'true')

    await page.evaluate(({ token, session }) => localStorage.setItem(token, JSON.stringify(session)), { token, session: fixtureSession(FIXTURE_USERS[1]) })
    const loaded = page.waitForResponse((r) => r.url().includes('/lecture_answers') && r.request().method() === 'GET')
    await page.reload()
    await loaded
    await rendered(page, '.lec-page:not([inert]) .lec-title')
    assert.equal(await page.locator(selected).count(), 0)
  })

  await scenario('lecture-neighbors-and-gaps', viewport, async (page, fault) => {
    fault.lectureDays = Array.from({ length: 7 }, (_, index) => ({
      ...lectureSamples[0], date: `2026-11-${14 + index}`, title: `Lecture ${14 + index}`,
    }))
    const requests = new Set()
    page.on('request', (r) => {
      const path = new URL(r.url()).pathname
      if (path.startsWith('/api/lecture/')) requests.add(path.split('/').at(-1))
    })
    await page.goto(baseUrl + '/vocabulary')
    await page.waitForURL(baseUrl + '/lecture')
    await rendered(page, '.lec-entry')
    assert.equal(await page.locator('.lec-entry').count(), 7)
    assert.equal(requests.size, 0)
    await page.locator('.lec-entry').filter({ hasText: 'Lecture 17' }).click()
    await rendered(page, '.lec-page:not([inert]) .lec-title')
    assert.deepEqual([...requests].sort(), ['2026-11-16','2026-11-17','2026-11-18'])
    await page.locator('.lec').evaluate((target) => {
      const touch = (clientX) => new Touch({ identifier: 1, target, clientX, clientY: 200 })
      target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(250)] }))
      target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [touch(100)] }))
    })
    await page.waitForURL(baseUrl + '/lecture/2026-11-18')
    await page.locator('.lec-page:not([inert]) .lec-title').filter({ hasText: 'Lecture 18' }).waitFor({ state: 'attached' })

    await page.route('**/api/lecture/2026-11-20', (r) => r.fulfill({ status: 404, json: null }))
    await page.goto(baseUrl + '/lecture/2026-11-20')
    await page.waitForURL(baseUrl + '/lecture')
    await rendered(page, '.lec-entry')
    assert.equal(await page.locator('.lec-entry').filter({ hasText: 'Lecture 20' }).count(), 0)
    fault.lectureStatus = 503
    const unavailable = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/lecture' && r.status() === 503)
    await page.reload()
    await unavailable
    await page.locator('.lec-archive').waitFor({ state: 'attached' })
    assert.equal(await page.locator('.lec-entry, [role="alert"]').count(), 0)
  })

  await scenario('route-spelling', viewport, async (page) => {
    for (const path of ['/resources/', '/RESOURCES/', '/lecture/', '/assistant/', '/login/', '/reset-password/']) {
      await page.goto(baseUrl + path)
      await page.waitForFunction(() => document.querySelector('#root > :not(.boot-overlay)') && !document.querySelector('.boot-overlay'))
      assert.equal(await page.locator('.site-header').count(), 0, `${path} 不应重复页眉`)
      assert.equal(await page.locator('.site-footer').count(), 0, `${path} 不应重复页脚`)
    }
    await rendered(page, '.lgn-title')
    await signIn(page)
    for (const path of ['/reset-password/', '/RESET-PASSWORD/']) {
      await page.goto(`${baseUrl}${path}?error=access_denied&error_code=otp_expired`)
      await page.getByText('链接已失效或账号发生了变化。请回到登录页重新申请重置邮件。', { exact: true }).waitFor()
      assert.equal(await page.locator('.password-field input').count(), 0, '过期链接不能借已有登录状态继续改密码')
    }
  })
}
